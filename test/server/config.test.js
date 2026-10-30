'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../server/config');

test('uses safe local defaults', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.chat.provider, 'mock');
  assert.deepEqual(config.chat.rateLimit, { windowMs: 60000, max: 10 });
  assert.equal(config.chat.mock.simulateErrors, false);
});

test('never copies the AI provider key into config', () => {
  const config = loadConfig({ AI_PROVIDER_API_KEY: 'sk-test-should-not-appear' });
  assert.doesNotMatch(JSON.stringify(config), /sk-test-should-not-appear/);
});

test('rejects invalid numbers and booleans', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ CHAT_RATE_LIMIT_MAX: '0' }), /CHAT_RATE_LIMIT_MAX/);
  assert.throws(() => loadConfig({ CHAT_MOCK_SIMULATE_ERRORS: 'yes' }), /CHAT_MOCK_SIMULATE_ERRORS/);
  assert.equal(loadConfig({ CHAT_MOCK_DELAY_MS: '0' }).chat.mock.delayMs, 0);
});
