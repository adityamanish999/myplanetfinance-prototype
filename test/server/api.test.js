'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../server/app');
const { createChatService } = require('../../server/chat/chatService');
const { createRateLimiter } = require('../../server/chat/rateLimiter');
const { createMockProvider } = require('../../server/chat/providers/mockProvider');

const silentLogger = { warn() {}, error() {} };

async function startServer({ provider = createMockProvider(), max = 50, siteContent } = {}) {
  const app = createApp({
    chatService: createChatService({ provider, timeoutMs: 1000, logger: silentLogger }),
    rateLimiter: createRateLimiter({ windowMs: 60000, max }),
    siteContent,
    logger: silentLogger,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

function postChat(baseUrl, body, headers = { 'Content-Type': 'application/json' }) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /api/chat returns a mock reply with security headers', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const res = await postChat(srv.baseUrl, { message: 'Tell me about ICET mock tests' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /mock tests/i);
  assert.deepEqual(Object.keys(body), ['reply']);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('rejects invalid input with 400 and a safe message', async (t) => {
  const srv = await startServer();
  t.after(srv.close);

  const blank = await postChat(srv.baseUrl, { message: '   ' });
  assert.equal(blank.status, 400);
  assert.deepEqual(await blank.json(), { error: { code: 'INVALID_REQUEST', message: 'Please enter a message.' } });

  const tooLong = await postChat(srv.baseUrl, { message: 'a'.repeat(1001) });
  assert.equal(tooLong.status, 400);

  const badJson = await postChat(srv.baseUrl, '{"message":');
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error.code, 'INVALID_JSON');
});

test('rejects non-JSON and oversized bodies', async (t) => {
  const srv = await startServer();
  t.after(srv.close);

  const text = await postChat(srv.baseUrl, 'message=hi', { 'Content-Type': 'text/plain' });
  assert.equal(text.status, 415);

  const huge = await postChat(srv.baseUrl, { message: 'hi', history: [{ role: 'user', content: 'x'.repeat(20000) }] });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).error.code, 'PAYLOAD_TOO_LARGE');
});

test('rate limits each client with 429 and Retry-After', async (t) => {
  const srv = await startServer({ max: 2 });
  t.after(srv.close);
  assert.equal((await postChat(srv.baseUrl, { message: 'hi' })).status, 200);
  assert.equal((await postChat(srv.baseUrl, { message: 'hi' })).status, 200);
  const limited = await postChat(srv.baseUrl, { message: 'hi' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
});

test('provider failures return 502 without leaking internals', async (t) => {
  const provider = { name: 'broken', generateReply: async () => { throw new Error('secret-key-123 rejected by upstream'); } };
  const srv = await startServer({ provider });
  t.after(srv.close);
  const res = await postChat(srv.baseUrl, { message: 'hi' });
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.doesNotMatch(text, /secret-key-123|upstream|stack/i);
  assert.equal(JSON.parse(text).error.code, 'PROVIDER_ERROR');
});

test('unknown API routes return JSON 404; GET /api/chat is not allowed', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const missing = await fetch(`${srv.baseUrl}/api/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  const get = await fetch(`${srv.baseUrl}/api/chat`);
  assert.equal(get.status, 404);
});

test('public pages load the chat widget', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  for (const page of ['/', '/mock-tests.html']) {
    const res = await fetch(srv.baseUrl + page);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<script src="\/js\/chat-widget\.js"><\/script>/);
    assert.match(html, /\/css\/chat-widget\.css/);
  }
  const js = await fetch(`${srv.baseUrl}/js/chat-widget.js`);
  assert.equal(js.status, 200);
  assert.doesNotMatch(await js.text(), /AI_PROVIDER_API_KEY|sk-/);
});

test('public pages render configured social links in header and footer', async (t) => {
  // Test fixtures only — not real MyPlanetFinance profiles.
  const siteContent = {
    socialLinks: [
      { platform: 'linkedin', url: 'https://www.linkedin.com/company/example-test-page/' },
      { platform: 'instagram', url: 'https://www.instagram.com/example_test_page/' },
    ],
  };
  const srv = await startServer({ siteContent });
  t.after(srv.close);

  const home = await (await fetch(`${srv.baseUrl}/`)).text();
  assert.doesNotMatch(home, /<!--SOCIAL_/);
  assert.equal((home.match(/data-social="linkedin"/g) || []).length, 2, 'LinkedIn in top bar and footer');
  assert.equal((home.match(/data-social="instagram"/g) || []).length, 2, 'Instagram in top bar and footer');
  assert.match(home, /href="https:\/\/www\.linkedin\.com\/company\/example-test-page\/" target="_blank" rel="noopener noreferrer"/);

  for (const page of ['/index.html', '/mock-tests.html']) {
    const html = await (await fetch(srv.baseUrl + page)).text();
    assert.doesNotMatch(html, /<!--SOCIAL_/, page);
    assert.match(html, /data-social="instagram"/, page);
  }
});

test('public pages show no social links until URLs are configured', async (t) => {
  const srv = await startServer({ siteContent: { socialLinks: [] } });
  t.after(srv.close);
  const home = await (await fetch(`${srv.baseUrl}/`)).text();
  assert.doesNotMatch(home, /<!--SOCIAL_|data-social=|topbar__social/);
  assert.match(home, /Social media links coming soon/);
});

test('does not serve .env or server source files', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  for (const path of ['/.env', '/.env.example', '/server/app.js', '/package.json']) {
    const res = await fetch(srv.baseUrl + path);
    assert.equal(res.status, 404, path);
  }
});
