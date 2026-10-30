'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('../../server/app');
const { createChatService } = require('../../server/chat/chatService');
const { createRateLimiter } = require('../../server/chat/rateLimiter');
const { createMockProvider } = require('../../server/chat/providers/mockProvider');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createTestRepository } = require('../../server/mockTests/testRepository');
const { createAttemptService } = require('../../server/mockTests/attemptService');
const { createAdminAuth, hashPassword } = require('../../server/admin/adminAuth');
const { tempDir, testInput, questionInput } = require('./helpers/mockTestFixtures');

const silentLogger = { warn() {}, error() {} };
const PASSWORD = 'test-only-password-123';
const PASSWORD_HASH = hashPassword(PASSWORD);
const SEED = require('../../data/seed/mock-tests.json');

async function startServer({ adminEnabled = true, loginMax = 50, startMax = 50 } = {}) {
  const dir = tempDir();
  const testStore = createJsonStore(path.join(dir, 'mock-tests.json'), { initial: () => structuredClone(SEED) });
  const attemptStore = createJsonStore(path.join(dir, 'attempts.json'), { initial: { version: 1, attempts: {} } });
  const repository = createTestRepository(testStore);
  const app = createApp({
    chatService: createChatService({ provider: createMockProvider(), timeoutMs: 1000, logger: silentLogger }),
    rateLimiter: createRateLimiter({ windowMs: 60000, max: 50 }),
    mockTests: {
      repository,
      attemptService: createAttemptService({ store: attemptStore, repository }),
      startLimiter: createRateLimiter({ windowMs: 60000, max: startMax }),
      writeLimiter: createRateLimiter({ windowMs: 60000, max: 1000 }),
    },
    admin: {
      auth: createAdminAuth(adminEnabled ? { username: 'admin', passwordHash: PASSWORD_HASH, sessionTtlMs: 60000 } : { sessionTtlMs: 60000 }),
      repository,
      loginLimiter: createRateLimiter({ windowMs: 60000, max: loginMax }),
    },
    logger: silentLogger,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { body, cookie, headers = {} } = {}) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null, text };
  }

  async function login() {
    const res = await call('POST', '/api/admin/login', { body: { username: 'admin', password: PASSWORD } });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  }

  return { baseUrl, call, login, close: () => new Promise((r) => server.close(r)) };
}

test('lists both exams and their published sample tests', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const exams = await srv.call('GET', '/api/exams');
  assert.deepEqual(exams.body.exams.map((e) => [e.code, e.name, e.testCount]), [['ap-icet', 'AP ICET', 1], ['tg-icet', 'TG ICET', 1]]);

  const list = await srv.call('GET', '/api/exams/tg-icet/tests');
  assert.equal(list.body.tests.length, 1);
  assert.equal(list.body.tests[0].questionCount, 9);
  assert.doesNotMatch(list.text, /correctOption|explanation/);

  assert.equal((await srv.call('GET', '/api/exams/ts-icet/tests')).status, 404);
  const detail = await srv.call('GET', `/api/tests/${list.body.tests[0].id}`);
  assert.equal(detail.body.exam.name, 'TG ICET');
  assert.match(detail.body.test.instructions, /placeholder/);
});

test('full attempt flow: start, answer, resume, submit, result', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const started = await srv.call('POST', '/api/tests/ap-icet-sample-1/attempts');
  assert.equal(started.status, 201);
  const attempt = started.body.attempt;
  assert.doesNotMatch(started.text, /correctOption|explanation/);

  const save = await srv.call('PUT', `/api/attempts/${attempt.id}/answers/${attempt.questions[0].id}`, { body: { selectedOption: 0, marked: true } });
  assert.equal(save.status, 200);
  assert.equal(save.body.answeredCount, 1);

  const resumed = await srv.call('GET', `/api/attempts/${attempt.id}`);
  assert.equal(resumed.body.attempt.answers[attempt.questions[0].id], 0);
  assert.equal(resumed.body.attempt.marked[attempt.questions[0].id], true);

  assert.equal((await srv.call('GET', `/api/attempts/${attempt.id}/result`)).status, 409);
  const submitted = await srv.call('POST', `/api/attempts/${attempt.id}/submit`);
  assert.equal(submitted.body.attempt.status, 'submitted');

  const result = await srv.call('GET', `/api/attempts/${attempt.id}/result`);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.total, 9);
  assert.equal(result.body.result.correct, 1, 'sample question 1 has option A correct');
  assert.equal(result.body.result.review[0].outcome, 'correct');

  const late = await srv.call('PUT', `/api/attempts/${attempt.id}/answers/${attempt.questions[1].id}`, { body: { selectedOption: 1 } });
  assert.equal(late.status, 409);
});

test('answer saving requires JSON and valid values', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const { attempt } = (await srv.call('POST', '/api/tests/ap-icet-sample-1/attempts')).body;
  const url = `/api/attempts/${attempt.id}/answers/${attempt.questions[0].id}`;
  assert.equal((await srv.call('PUT', url, { body: { selectedOption: 9 } })).status, 400);
  const res = await fetch(srv.baseUrl + url, { method: 'PUT', body: 'selectedOption=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 415);
  assert.equal((await srv.call('GET', '/api/attempts/00000000-0000-4000-8000-000000000000')).status, 404);
});

test('starting attempts is rate limited', async (t) => {
  const srv = await startServer({ startMax: 2 });
  t.after(srv.close);
  await srv.call('POST', '/api/tests/ap-icet-sample-1/attempts');
  await srv.call('POST', '/api/tests/ap-icet-sample-1/attempts');
  const limited = await srv.call('POST', '/api/tests/ap-icet-sample-1/attempts');
  assert.equal(limited.status, 429);
});

test('admin API is disabled when credentials are not configured', async (t) => {
  const srv = await startServer({ adminEnabled: false });
  t.after(srv.close);
  const res = await srv.call('POST', '/api/admin/login', { body: { username: 'admin', password: PASSWORD } });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'ADMIN_DISABLED');
});

test('admin endpoints require sign-in; wrong passwords are rejected and rate limited', async (t) => {
  const srv = await startServer({ loginMax: 2 });
  t.after(srv.close);
  assert.equal((await srv.call('GET', '/api/admin/tests')).status, 401);
  assert.equal((await srv.call('GET', '/api/admin/tests', { cookie: 'mpf_admin=forged' })).status, 401);

  const wrong = await srv.call('POST', '/api/admin/login', { body: { username: 'admin', password: 'wrong' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.doesNotMatch(wrong.text, /wrong/);

  const cookie = await srv.login();
  assert.equal((await srv.call('GET', '/api/admin/session', { cookie })).body.username, 'admin');
  assert.equal((await srv.call('POST', '/api/admin/login', { body: { username: 'admin', password: 'x' } })).status, 429);

  await srv.call('POST', '/api/admin/logout', { cookie });
  assert.equal((await srv.call('GET', '/api/admin/tests', { cookie })).status, 401);
});

test('admin writes from another origin are blocked', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const res = await srv.call('POST', '/api/admin/tests', { cookie, body: testInput(), headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  const sameOrigin = await srv.call('POST', '/api/admin/tests', { cookie, body: testInput(), headers: { Origin: srv.baseUrl } });
  assert.equal(sameOrigin.status, 201);
});

test('admin creates a test, adds and edits questions, publishes it, and it appears publicly', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();

  const created = await srv.call('POST', '/api/admin/tests', { cookie, body: testInput({ exam: 'tg-icet', title: 'Admin-made placeholder test' }) });
  assert.equal(created.status, 201);
  const draft = created.body.test;

  const added = await srv.call('POST', `/api/admin/tests/${draft.id}/questions`, { cookie, body: questionInput(draft.sections[0].id) });
  assert.equal(added.status, 201);
  const edited = await srv.call('PUT', `/api/admin/tests/${draft.id}/questions/${added.body.question.id}`, {
    cookie,
    body: questionInput(draft.sections[0].id, { text: 'Edited placeholder?' }),
  });
  assert.equal(edited.body.question.text, 'Edited placeholder?');

  const invalid = await srv.call('POST', `/api/admin/tests/${draft.id}/questions`, { cookie, body: questionInput(draft.sections[0].id, { correctOption: 7 }) });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error.message, /Correct answer/);

  let publicList = await srv.call('GET', '/api/exams/tg-icet/tests');
  assert.equal(publicList.body.tests.length, 1, 'draft is not public');

  const published = await srv.call('PUT', `/api/admin/tests/${draft.id}`, { cookie, body: testInput({ exam: 'tg-icet', title: 'Admin-made placeholder test', published: true, sections: draft.sections }) });
  assert.equal(published.status, 200);
  publicList = await srv.call('GET', '/api/exams/tg-icet/tests');
  assert.equal(publicList.body.tests.length, 2);

  const full = await srv.call('GET', `/api/admin/tests/${draft.id}`, { cookie });
  assert.equal(full.body.test.questions[0].correctOption, 1, 'admin sees answers');

  const removed = await srv.call('DELETE', `/api/admin/tests/${draft.id}/questions/${added.body.question.id}`, { cookie });
  assert.equal(removed.status, 409, 'last question of a published test cannot be deleted');
});

test('mock-test pages are served', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  for (const page of ['/mock-tests.html', '/mock-tests/ap-icet.html', '/mock-tests/tg-icet.html', '/mock-tests/instructions.html', '/mock-tests/test.html', '/mock-tests/result.html', '/admin/']) {
    const res = await fetch(srv.baseUrl + page);
    assert.equal(res.status, 200, page);
  }
});
