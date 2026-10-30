'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createAttemptService, GRACE_MS } = require('../../server/mockTests/attemptService');
const { setupEngine, questionInput, testInput } = require('./helpers/mockTestFixtures');

const MINUTE = 60 * 1000;

function expectHttpError(fn, status, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test('starting an attempt never exposes correct answers or explanations', () => {
  const { attempts, test: t } = setupEngine();
  const attempt = attempts.start(t.id);
  assert.equal(attempt.status, 'in_progress');
  assert.equal(attempt.questions.length, 4);
  const serialized = JSON.stringify(attempt);
  assert.doesNotMatch(serialized, /correctOption|explanation/);
  assert.equal(new Date(attempt.expiresAt) - new Date(attempt.startedAt), 10 * MINUTE);
});

test('orders questions by section and only includes sections that have questions', () => {
  const { attempts, test: t } = setupEngine({ count: 4 });
  const attempt = attempts.start(t.id);
  const sectionOrder = attempt.questions.map((q) => attempt.sections.findIndex((s) => s.id === q.sectionId));
  assert.deepEqual(sectionOrder, [...sectionOrder].sort((a, b) => a - b));
});

test('rejects unpublished or unknown tests', () => {
  const { attempts, repository } = setupEngine();
  const draft = repository.createTest(testInput());
  expectHttpError(() => attempts.start(draft.id), 404);
  expectHttpError(() => attempts.start('nope'), 404);
});

test('saves answers and review marks, and supports clearing', () => {
  const { attempts, test: t } = setupEngine();
  const { id, questions } = attempts.start(t.id);
  attempts.saveAnswer(id, questions[0].id, { selectedOption: 2 });
  attempts.saveAnswer(id, questions[1].id, { marked: true });
  attempts.saveAnswer(id, questions[2].id, { selectedOption: 0, marked: true });

  let state = attempts.get(id);
  assert.deepEqual(state.answers, { [questions[0].id]: 2, [questions[2].id]: 0 });
  assert.deepEqual(state.marked, { [questions[1].id]: true, [questions[2].id]: true });

  attempts.saveAnswer(id, questions[0].id, { selectedOption: null });
  attempts.saveAnswer(id, questions[1].id, { marked: false });
  state = attempts.get(id);
  assert.deepEqual(state.answers, { [questions[2].id]: 0 });
  assert.deepEqual(state.marked, { [questions[2].id]: true });
});

test('validates saved answers', () => {
  const { attempts, test: t } = setupEngine();
  const { id, questions } = attempts.start(t.id);
  for (const body of [{}, { selectedOption: 4 }, { selectedOption: -1 }, { selectedOption: '1' }, { marked: 'yes' }, { selectedOption: 1, extra: 1 }, null]) {
    expectHttpError(() => attempts.saveAnswer(id, questions[0].id, body), 400);
  }
  expectHttpError(() => attempts.saveAnswer(id, 'unknown-question', { selectedOption: 1 }), 404);
  expectHttpError(() => attempts.saveAnswer('not-a-uuid', questions[0].id, { selectedOption: 1 }), 404);
});

test('accepts answers within the grace period, then auto-submits', () => {
  const clockSetup = setupEngine();
  const { attempts, test: t, clock } = clockSetup;
  const { id, questions } = attempts.start(t.id);

  clock.advance(10 * MINUTE + GRACE_MS - 1);
  attempts.saveAnswer(id, questions[0].id, { selectedOption: questions[0] && 0 });

  clock.advance(2);
  expectHttpError(() => attempts.saveAnswer(id, questions[1].id, { selectedOption: 1 }), 409, 'ATTEMPT_CLOSED');
  const state = attempts.get(id);
  assert.equal(state.status, 'submitted');
  assert.equal(state.autoSubmitted, true);
  assert.equal(new Date(state.submittedAt).getTime(), new Date(state.expiresAt).getTime());

  const result = attempts.getResult(id);
  assert.equal(result.autoSubmitted, true);
  assert.equal(result.total, 4);
});

test('an abandoned attempt is auto-submitted with its saved answers when next accessed', () => {
  const { attempts, test: t, clock } = setupEngine();
  const { id, questions } = attempts.start(t.id);
  attempts.saveAnswer(id, questions[0].id, { selectedOption: 0 });
  clock.advance(2 * 60 * MINUTE);
  const result = attempts.getResult(id);
  assert.equal(result.autoSubmitted, true);
  assert.equal(result.review[0].selectedOption, 0);
});

test('scores correct, incorrect and unanswered questions, with negative marking', () => {
  const { attempts, test: t, repository } = setupEngine({ count: 4, negativeMarks: 0.25 });
  const stored = repository.getTest(t.id);
  const { id, questions } = attempts.start(t.id);
  const correctOf = (qid) => stored.questions.find((q) => q.id === qid).correctOption;

  attempts.saveAnswer(id, questions[0].id, { selectedOption: correctOf(questions[0].id) });
  attempts.saveAnswer(id, questions[1].id, { selectedOption: correctOf(questions[1].id) });
  attempts.saveAnswer(id, questions[2].id, { selectedOption: (correctOf(questions[2].id) + 1) % 4 });
  attempts.submit(id);

  const result = attempts.getResult(id);
  assert.equal(result.correct, 2);
  assert.equal(result.incorrect, 1);
  assert.equal(result.unanswered, 1);
  assert.equal(result.score, 1.75);
  assert.equal(result.maxScore, 4);
  assert.equal(result.autoSubmitted, false);
  assert.equal(result.sections.reduce((n, s) => n + s.total, 0), 4);
  assert.deepEqual(result.review.map((r) => r.outcome), ['correct', 'correct', 'incorrect', 'unanswered']);
  assert.ok(result.review.every((r) => typeof r.explanation === 'string' && Number.isInteger(r.correctOption)));
});

test('results are only available after submission; submit is idempotent', () => {
  const { attempts, test: t, clock } = setupEngine();
  const { id } = attempts.start(t.id);
  expectHttpError(() => attempts.getResult(id), 409, 'ATTEMPT_IN_PROGRESS');
  const first = attempts.submit(id);
  const submittedAt = attempts.getResult(id).submittedAt;
  clock.advance(MINUTE);
  const second = attempts.submit(id);
  assert.deepEqual(first, second);
  assert.equal(attempts.getResult(id).submittedAt, submittedAt);
  expectHttpError(() => attempts.saveAnswer(id, attempts.get(id).questions[0].id, { selectedOption: 1 }), 409, 'ATTEMPT_CLOSED');
});

test('admin edits during an attempt do not change it', () => {
  const { attempts, test: t, repository } = setupEngine();
  const { id, questions } = attempts.start(t.id);
  const stored = repository.getTest(t.id);
  const original = stored.questions.find((q) => q.id === questions[0].id);
  repository.updateQuestion(t.id, original.id, questionInput(original.sectionId, { text: 'Changed mid-test', correctOption: (original.correctOption + 1) % 4 }));

  assert.equal(attempts.get(id).questions[0].text, questions[0].text);
  attempts.saveAnswer(id, questions[0].id, { selectedOption: original.correctOption });
  attempts.submit(id);
  assert.equal(attempts.getResult(id).review[0].outcome, 'correct');
});

test('attempts survive a server restart', () => {
  const { attempts, test: t, dir, repository, clock } = setupEngine();
  const { id, questions } = attempts.start(t.id);
  attempts.saveAnswer(id, questions[0].id, { selectedOption: 3 });

  const reopened = createAttemptService({
    store: createJsonStore(path.join(dir, 'attempts.json'), { initial: { version: 1, attempts: {} } }),
    repository,
    now: clock.now,
  });
  assert.equal(reopened.get(id).answers[questions[0].id], 3);
});
