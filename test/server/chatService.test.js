'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatService, ChatServiceError, redactPersonalData, MAX_REPLY_LENGTH } = require('../../server/chat/chatService');
const { SYSTEM_PROMPT } = require('../../server/chat/systemPrompt');

function recordingLogger() {
  const lines = [];
  return { lines, warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
}

test('passes system prompt, history and an abort signal to the provider', async () => {
  let received;
  const provider = { name: 'fake', generateReply: async (args) => { received = args; return { text: 'ok' }; } };
  const service = createChatService({ provider, timeoutMs: 1000, logger: recordingLogger() });
  const result = await service.reply({ message: 'Hi', history: [{ role: 'user', content: 'Earlier' }] });
  assert.deepEqual(result, { reply: 'ok' });
  assert.equal(received.systemPrompt, SYSTEM_PROMPT);
  assert.deepEqual(received.history, [{ role: 'user', content: 'Earlier' }]);
  assert.ok(received.signal instanceof AbortSignal);
});

test('redacts emails and long numbers before they reach the provider', async () => {
  let received;
  const provider = { name: 'fake', generateReply: async (args) => { received = args; return { text: 'ok' }; } };
  const service = createChatService({ provider, timeoutMs: 1000, logger: recordingLogger() });
  await service.reply({
    message: 'Mail me at student@example.com or call +91 98765 43210',
    history: [{ role: 'user', content: 'My Aadhaar is 1234 5678 9012' }],
  });
  assert.equal(received.message, 'Mail me at [redacted] or call [redacted]');
  assert.equal(received.history[0].content, 'My Aadhaar is [redacted]');
});

test('redactPersonalData leaves short numbers alone', () => {
  assert.equal(redactPersonalData('ICET 2026 has 200 questions'), 'ICET 2026 has 200 questions');
});

test('times out slow providers with a safe error', async () => {
  const provider = { name: 'slow', generateReply: () => new Promise(() => {}) };
  const service = createChatService({ provider, timeoutMs: 20, logger: recordingLogger() });
  await assert.rejects(service.reply({ message: 'Hi', history: [] }), (err) => {
    assert.ok(err instanceof ChatServiceError);
    assert.equal(err.code, 'TIMEOUT');
    assert.equal(err.status, 504);
    return true;
  });
});

test('hides provider error details and never logs message content', async () => {
  const logger = recordingLogger();
  const provider = {
    name: 'broken',
    generateReply: async () => { throw new Error('upstream said: key sk-secret-123 invalid'); },
  };
  const service = createChatService({ provider, timeoutMs: 1000, logger });
  await assert.rejects(service.reply({ message: 'my private question', history: [] }), (err) => {
    assert.equal(err.code, 'PROVIDER_ERROR');
    assert.doesNotMatch(err.publicMessage, /sk-secret|upstream/);
    return true;
  });
  const logged = logger.lines.join('\n');
  assert.doesNotMatch(logged, /sk-secret|my private question/);
});

test('rejects empty replies and truncates very long ones', async () => {
  const empty = createChatService({ provider: { name: 'e', generateReply: async () => ({ text: '  ' }) }, timeoutMs: 1000, logger: recordingLogger() });
  await assert.rejects(empty.reply({ message: 'Hi', history: [] }), { code: 'EMPTY_REPLY' });

  const long = createChatService({ provider: { name: 'l', generateReply: async () => ({ text: 'x'.repeat(MAX_REPLY_LENGTH + 50) }) }, timeoutMs: 1000, logger: recordingLogger() });
  const result = await long.reply({ message: 'Hi', history: [] });
  assert.equal(result.reply.length, MAX_REPLY_LENGTH);
});
