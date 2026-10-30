'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createChatWidget, MAX_MESSAGE_LENGTH } = require('../../public/js/chat-widget');

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

function setup(fetchImpl) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return fetchImpl(url, init, calls.length);
  };
  const widget = createChatWidget({ document, window: dom.window, fetch });
  const q = (sel) => document.querySelector(sel);
  const ui = {
    launcher: q('.mpf-chat__launcher'),
    panel: q('.mpf-chat__panel'),
    close: q('.mpf-chat__close'),
    input: q('.mpf-chat__input'),
    send: q('.mpf-chat__send'),
    typing: q('.mpf-chat__typing'),
    error: q('.mpf-chat__error'),
    errorText: q('.mpf-chat__error-text'),
    retry: q('.mpf-chat__retry'),
    bubbles: () => [...document.querySelectorAll('.mpf-chat__message')].map((li) => ({
      role: li.classList.contains('mpf-chat__message--user') ? 'user' : 'assistant',
      text: li.querySelector('.mpf-chat__bubble').textContent,
    })),
  };
  function type(text) {
    ui.input.value = text;
    ui.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  return { dom, document, widget, ui, calls, type };
}

test('renders a closed floating launcher with accessible labels', () => {
  const { ui } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  assert.ok(ui.launcher);
  assert.equal(ui.launcher.getAttribute('aria-expanded'), 'false');
  assert.equal(ui.launcher.getAttribute('aria-label'), 'Open chat with MyPlanetFinance assistant');
  assert.equal(ui.launcher.textContent, 'Ask me');
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.panel.getAttribute('role'), 'dialog');
});

test('opens and closes the panel, managing focus', () => {
  const { ui, document, dom } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  ui.launcher.click();
  assert.equal(ui.panel.hidden, false);
  assert.equal(ui.launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, ui.input);

  ui.panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(ui.panel.hidden, true);
  assert.equal(document.activeElement, ui.launcher);

  ui.launcher.click();
  ui.close.click();
  assert.equal(ui.panel.hidden, true);
});

test('shows a welcome message and disclaimer', () => {
  const { ui, document } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  assert.deepEqual(ui.bubbles().map((b) => b.role), ['assistant']);
  assert.match(document.querySelector('.mpf-chat__disclaimer').textContent, /not financial or admissions advice/);
});

test('send button is disabled until the user types', () => {
  const { ui, type } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  assert.equal(ui.send.disabled, true);
  type('   ');
  assert.equal(ui.send.disabled, true);
  type('Hello');
  assert.equal(ui.send.disabled, false);
  assert.equal(ui.input.getAttribute('maxlength'), String(MAX_MESSAGE_LENGTH));
});

test('sends a message, shows the loading state, then the reply', async () => {
  const pending = deferred();
  const { ui, type, calls } = setup(() => pending.promise);
  ui.launcher.click();
  type('What programmes do you offer?');
  ui.send.click();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/chat');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, { message: 'What programmes do you offer?', history: [] });

  assert.equal(ui.typing.hidden, false, 'typing indicator visible while waiting');
  assert.equal(ui.send.disabled, true, 'send disabled while waiting');
  assert.equal(ui.input.value, '');
  assert.deepEqual(ui.bubbles().at(-1), { role: 'user', text: 'What programmes do you offer?' });

  pending.resolve(jsonResponse(200, { reply: 'Here are our programmes.' }));
  await flush();

  assert.equal(ui.typing.hidden, true);
  assert.deepEqual(ui.bubbles().at(-1), { role: 'assistant', text: 'Here are our programmes.' });
});

test('Enter sends and Shift+Enter does not', async () => {
  const { ui, type, calls, dom } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  type('line one');
  ui.input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  assert.equal(calls.length, 0);
  ui.input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(calls.length, 1);
  await flush();
});

test('sends prior turns as history on the next message', async () => {
  const { widget, calls } = setup(async (url, init, n) => jsonResponse(200, { reply: `reply ${n}` }));
  await widget.send('first');
  await widget.send('second');
  assert.deepEqual(calls[1].body.history, [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply 1' },
  ]);
});

test('renders replies as text, never HTML', async () => {
  const { widget, document } = setup(async () => jsonResponse(200, { reply: '<img src=x onerror="alert(1)">' }));
  await widget.send('hi');
  assert.equal(document.querySelector('img'), null);
  assert.match(document.querySelector('.mpf-chat__message--assistant:last-child .mpf-chat__bubble').textContent, /<img/);
});

test('shows the server error message with retry for retryable errors', async () => {
  const { widget, ui } = setup(async () => jsonResponse(502, { error: { code: 'PROVIDER_ERROR', message: 'The assistant is unavailable right now.' } }));
  await widget.send('hi');
  assert.equal(ui.error.hidden, false);
  assert.equal(ui.error.getAttribute('role'), 'alert');
  assert.equal(ui.errorText.textContent, 'The assistant is unavailable right now.');
  assert.equal(ui.retry.hidden, false);
  assert.equal(ui.typing.hidden, true);
});

test('hides retry for validation errors', async () => {
  const { widget, ui } = setup(async () => jsonResponse(400, { error: { code: 'INVALID_REQUEST', message: 'Please enter a message.' } }));
  await widget.send('hi');
  assert.equal(ui.errorText.textContent, 'Please enter a message.');
  assert.equal(ui.retry.hidden, true);
});

test('network failure shows a generic message; retry resends without duplicating the bubble', async () => {
  const { widget, ui, calls } = setup(async (url, init, n) => {
    if (n === 1) throw new TypeError('Failed to fetch');
    return jsonResponse(200, { reply: 'Back online.' });
  });
  await widget.send('hello');
  assert.match(ui.errorText.textContent, /Couldn't reach the assistant/);
  const userBubbles = () => ui.bubbles().filter((b) => b.role === 'user').length;
  assert.equal(userBubbles(), 1);

  ui.retry.click();
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.message, 'hello');
  assert.equal(userBubbles(), 1);
  assert.equal(ui.error.hidden, true);
  assert.deepEqual(ui.bubbles().at(-1), { role: 'assistant', text: 'Back online.' });
});

test('handles non-JSON error responses safely', async () => {
  const { widget, ui } = setup(async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad'); } }));
  await widget.send('hi');
  assert.equal(ui.errorText.textContent, 'Something went wrong. Please try again.');
});

test('rejects over-long messages client-side without calling the server', async () => {
  const { widget, ui, calls } = setup(async () => jsonResponse(200, { reply: 'ok' }));
  await widget.send('a'.repeat(MAX_MESSAGE_LENGTH + 1));
  assert.equal(calls.length, 0);
  assert.match(ui.errorText.textContent, /1000 characters or fewer/);
});

test('ignores new sends while a request is in flight', async () => {
  const pending = deferred();
  const { widget, calls } = setup(() => pending.promise);
  widget.send('one');
  widget.send('two');
  assert.equal(calls.length, 1);
  pending.resolve(jsonResponse(200, { reply: 'ok' }));
  await flush();
});
