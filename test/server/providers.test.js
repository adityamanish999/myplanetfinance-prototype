'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatProvider } = require('../../server/chat/providers');
const { createMockProvider, pickReply, DEFAULT_REPLY, SIMULATE_ERROR_TRIGGER } = require('../../server/chat/providers/mockProvider');

test('factory returns the mock provider by default config', () => {
  const provider = createChatProvider({ provider: 'mock', mock: { delayMs: 0, simulateErrors: false } });
  assert.equal(provider.name, 'mock');
});

test('factory refuses unconfigured providers', () => {
  assert.throws(() => createChatProvider({ provider: 'openai' }), /not configured/);
});

test('mock replies to known topics without inventing details', () => {
  assert.match(pickReply('Tell me about AP ICET mock tests'), /Mock Tests section/);
  assert.match(pickReply('TG ICET practice'), /not affiliated with the official exam authorities/);
  assert.match(pickReply('What programmes do you offer?'), /PGDM \/ MBA/);
  assert.match(pickReply('What are the fees?'), /can't share contact details, fees/);
  assert.match(pickReply('Show my account balance'), /don't have access to customer accounts/);
  assert.match(pickReply('Which stocks should I buy?'), /can't provide financial or investment advice/);
  assert.match(pickReply('hello'), /demo assistant/);
  assert.equal(pickReply('What is the weather?'), DEFAULT_REPLY);
});

test('no mock reply contains phone numbers, emails or URLs', () => {
  const inputs = ['icet', 'courses', 'contact', 'account', 'invest', 'who are you', 'hi', 'random'];
  for (const input of inputs) {
    const reply = pickReply(input);
    assert.doesNotMatch(reply, /\d{6,}|@|https?:\/\//, `reply for "${input}"`);
  }
});

test('mock provider returns { text }', async () => {
  const provider = createMockProvider();
  const result = await provider.generateReply({ message: 'hi', history: [] });
  assert.equal(typeof result.text, 'string');
});

test('simulated errors only fire when enabled', async () => {
  const off = createMockProvider({ simulateErrors: false });
  await assert.doesNotReject(off.generateReply({ message: SIMULATE_ERROR_TRIGGER }));
  const on = createMockProvider({ simulateErrors: true });
  await assert.rejects(on.generateReply({ message: SIMULATE_ERROR_TRIGGER }), /Simulated provider failure/);
});

test('mock delay honours abort signals', async () => {
  const provider = createMockProvider({ delayMs: 10000 });
  const controller = new AbortController();
  const pending = provider.generateReply({ message: 'hi', signal: controller.signal });
  controller.abort(new Error('aborted'));
  await assert.rejects(pending, /aborted/);
});
