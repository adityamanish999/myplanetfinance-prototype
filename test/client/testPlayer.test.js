'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createTestPlayer } = require('../../public/js/mock-test-player');
const { init: initPages } = require('../../public/js/mock-test-pages');

const TEST_HTML = fs.readFileSync(path.join(__dirname, '../../public/mock-tests/test.html'), 'utf8');
const INSTRUCTIONS_HTML = fs.readFileSync(path.join(__dirname, '../../public/mock-tests/instructions.html'), 'utf8');
const ATTEMPT_ID = '11111111-2222-4333-8444-555555555555';
const START = Date.UTC(2026, 9, 29, 10, 0, 0);
const MINUTE = 60 * 1000;

function json(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

/** In-memory stand-in for the attempt API (placeholder questions only). */
function fakeServer({ status = 'in_progress', durationMs = 10 * MINUTE } = {}) {
  const server = {
    online: true,
    status,
    answers: {},
    marked: {},
    calls: [],
    saveStatus: 200,
    clock: START,
  };
  const attempt = () => ({
    id: ATTEMPT_ID,
    testId: 'sample-test',
    title: 'Placeholder test',
    status: server.status,
    startedAt: new Date(START).toISOString(),
    expiresAt: new Date(START + durationMs).toISOString(),
    serverNow: new Date(server.clock).toISOString(),
    sections: [{ id: 's1', name: 'Section A' }, { id: 's2', name: 'Section B' }],
    questions: [
      { id: 'q1', sectionId: 's1', text: 'Placeholder question 1?', options: ['A1', 'B1', 'C1', 'D1'] },
      { id: 'q2', sectionId: 's1', text: 'Placeholder question 2?', options: ['A2', 'B2', 'C2', 'D2'] },
      { id: 'q3', sectionId: 's2', text: 'Placeholder question 3?', options: ['A3', 'B3', 'C3', 'D3'] },
    ],
    answers: { ...server.answers },
    marked: { ...server.marked },
  });
  server.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    server.calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (!server.online) throw new TypeError('Failed to fetch');
    if (method === 'GET' && url === `/api/attempts/${ATTEMPT_ID}`) return json(200, { attempt: attempt() });
    const save = url.match(/\/answers\/(\w+)$/);
    if (method === 'PUT' && save) {
      if (server.saveStatus !== 200) return json(server.saveStatus, { error: { code: 'X', message: 'x' } });
      if (server.status !== 'in_progress') return json(409, { error: { code: 'ATTEMPT_CLOSED', message: 'closed' } });
      const body = JSON.parse(init.body);
      if ('selectedOption' in body) {
        if (body.selectedOption === null) delete server.answers[save[1]];
        else server.answers[save[1]] = body.selectedOption;
      }
      if ('marked' in body) {
        if (body.marked) server.marked[save[1]] = true;
        else delete server.marked[save[1]];
      }
      return json(200, { saved: true });
    }
    if (method === 'POST' && url.endsWith('/submit')) {
      server.status = 'submitted';
      return json(200, { attempt: { id: ATTEMPT_ID, status: 'submitted' } });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  };
  return server;
}

function setup(server, { dom } = {}) {
  dom = dom || new JSDOM(TEST_HTML, { url: `http://127.0.0.1/mock-tests/test.html?attempt=${ATTEMPT_ID}` });
  const navigations = [];
  const clock = { now: START };
  const player = createTestPlayer({
    document: dom.window.document,
    window: dom.window,
    fetch: server.fetch,
    storage: dom.window.localStorage,
    navigate: (url) => navigations.push(url),
    now: () => clock.now,
    autoTick: false,
    retryDelays: [5, 5, 5],
  });
  const $ = (id) => dom.window.document.getElementById(id);
  const radios = () => [...dom.window.document.querySelectorAll('#tp-options input[type=radio]')];
  const palette = () => [...dom.window.document.querySelectorAll('#tp-palette-body .tp-pal')].map((b) => b.getAttribute('data-status'));
  return { dom, player, navigations, clock, $, radios, palette };
}

test('loads the attempt and renders the first question, timer and palette', async () => {
  const server = fakeServer();
  const { player, $, radios, palette } = setup(server);
  await player.ready;
  assert.equal($('tp-app').hidden, false);
  assert.equal($('tp-title').textContent, 'Placeholder test');
  assert.equal($('tp-number').textContent, 'Question 1 of 3');
  assert.equal($('tp-section').textContent, 'Section A');
  assert.equal($('tp-text').textContent, 'Placeholder question 1?');
  assert.equal(radios().length, 4);
  assert.equal($('tp-timer').textContent, '10:00');
  assert.deepEqual(palette(), ['not-answered', 'not-visited', 'not-visited']);
  assert.equal($('tp-prev').disabled, true);
  player.destroy();
});

test('selecting an answer saves it to the server immediately', async () => {
  const server = fakeServer();
  const { player, $, radios, palette } = setup(server);
  await player.ready;
  radios()[2].checked = true;
  radios()[2].dispatchEvent(new (radios()[2].ownerDocument.defaultView.Event)('change'));
  await flush();
  assert.deepEqual(server.answers, { q1: 2 });
  assert.deepEqual(server.calls.at(-1), { method: 'PUT', url: `/api/attempts/${ATTEMPT_ID}/answers/q1`, body: { selectedOption: 2 } });
  assert.equal($('tp-save').textContent, 'All answers saved');
  assert.equal(palette()[0], 'answered');
  assert.equal($('tp-count-answered').textContent, '1');
  player.destroy();
});

test('navigation, mark for review and clear answer', async () => {
  const server = fakeServer();
  const { player, $, palette } = setup(server);
  await player.ready;
  $('tp-next').click();
  assert.equal($('tp-number').textContent, 'Question 2 of 3');
  $('tp-mark').click();
  await flush();
  assert.deepEqual(server.marked, { q2: true });
  assert.equal($('tp-mark').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(palette(), ['not-answered', 'marked', 'not-visited']);

  player.selectOption(1);
  await flush();
  assert.equal(palette()[1], 'answered-marked');
  $('tp-clear').click();
  await flush();
  assert.deepEqual(server.answers, {});

  const palButtons = $('tp-palette-body').querySelectorAll('.tp-pal');
  palButtons[2].click();
  assert.equal($('tp-number').textContent, 'Question 3 of 3');
  assert.equal($('tp-section').textContent, 'Section B');
  assert.equal($('tp-next').disabled, true);
  player.destroy();
});

test('answers made offline are kept on the device and restored after a refresh', async () => {
  const server = fakeServer();
  const first = setup(server);
  await first.player.ready;
  server.online = false;
  first.player.selectOption(3);
  await flush();
  assert.match(first.$('tp-save').textContent, /Offline/);
  assert.deepEqual(server.answers, {});
  const backup = JSON.parse(first.dom.window.localStorage.getItem(`mpf-attempt:${ATTEMPT_ID}`));
  assert.deepEqual(backup.pending, { q1: { selectedOption: 3 } });
  first.player.destroy();

  // Simulate a page refresh while still offline at first, then the connection returns.
  server.online = true;
  const dom = new JSDOM(TEST_HTML, { url: `http://127.0.0.1/mock-tests/test.html?attempt=${ATTEMPT_ID}` });
  dom.window.localStorage.setItem(`mpf-attempt:${ATTEMPT_ID}`, JSON.stringify(backup));
  const second = setup(server, { dom });
  await second.player.ready;
  await flush();
  assert.equal(second.radios()[3].checked, true, 'restored answer is shown');
  assert.deepEqual(server.answers, { q1: 3 }, 'restored answer is synced to the server');
  assert.equal(second.$('tp-save').textContent, 'All answers saved');
  second.player.destroy();
});

test('retries failed saves automatically when the connection returns', async () => {
  const server = fakeServer();
  const { player, $ } = setup(server);
  await player.ready;
  server.online = false;
  player.selectOption(0);
  await flush();
  server.online = true;
  await new Promise((r) => setTimeout(r, 20));
  await flush();
  assert.deepEqual(server.answers, { q1: 0 });
  assert.equal($('tp-save').textContent, 'All answers saved');
  player.destroy();
});

test('warns before leaving the page during a test', async () => {
  const server = fakeServer();
  const { player, dom } = setup(server);
  await player.ready;
  const event = new dom.window.Event('beforeunload', { cancelable: true });
  dom.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  player.destroy();
});

test('submit asks for confirmation with a summary, then shows the result', async () => {
  const server = fakeServer();
  const { player, $, navigations, dom } = setup(server);
  await player.ready;
  player.selectOption(1);
  await flush();
  $('tp-submit').click();
  assert.equal($('tp-modal').hidden, false);
  assert.match($('tp-modal-summary').textContent, /1Answered2Not answered0Marked for review/);
  assert.match($('tp-modal-note').textContent, /2 unanswered questions/);

  $('tp-modal-cancel').click();
  assert.equal($('tp-modal').hidden, true);
  assert.equal(server.status, 'in_progress');

  $('tp-submit').click();
  $('tp-modal-confirm').click();
  await flush();
  assert.equal(server.status, 'submitted');
  assert.deepEqual(navigations, [`/mock-tests/result.html?attempt=${ATTEMPT_ID}`]);
  assert.equal(dom.window.localStorage.getItem(`mpf-attempt:${ATTEMPT_ID}`), null, 'backup cleared');
  const event = new dom.window.Event('beforeunload', { cancelable: true });
  dom.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, 'no leave warning after submitting');
  player.destroy();
});

test('manual submit is blocked while answers are unsaved, so nothing is lost', async () => {
  const server = fakeServer();
  const { player, $ } = setup(server);
  await player.ready;
  server.online = false;
  player.selectOption(2);
  await flush();
  player.openSubmitDialog();
  const pending = player.submit({ auto: false });
  await new Promise((r) => setTimeout(r, 5100));
  await pending;
  assert.match($('tp-modal-error').textContent, /haven't been saved yet/);
  assert.equal(server.status, 'in_progress');
  player.destroy();
});

test('timer warns near the end and submits automatically at time-up', async () => {
  const server = fakeServer();
  const { player, $, clock, navigations } = setup(server);
  await player.ready;
  player.selectOption(0);
  await flush();

  clock.now = START + 5.5 * MINUTE;
  player.tick();
  assert.equal($('tp-timer').textContent, '04:30');
  assert.ok($('tp-timer').classList.contains('tp-timer--low'));
  assert.equal($('tp-warning').textContent, '5 minutes left.');

  clock.now = START + 9.5 * MINUTE;
  player.tick();
  assert.match($('tp-warning').textContent, /1 minute left/);

  clock.now = START + 10 * MINUTE;
  player.tick();
  await flush();
  assert.equal(server.status, 'submitted');
  assert.deepEqual(server.answers, { q1: 0 }, 'saved answers are kept');
  assert.deepEqual(navigations, [`/mock-tests/result.html?attempt=${ATTEMPT_ID}`]);
  player.destroy();
});

test('uses the server clock, not the device clock', async () => {
  const server = fakeServer();
  server.clock = START + 2 * MINUTE; // device clock is 2 minutes behind the server
  const { player, $ } = setup(server);
  await player.ready;
  assert.equal($('tp-timer').textContent, '08:00');
  player.destroy();
});

test('goes to the result page if the test was already submitted or closes mid-test', async () => {
  const done = fakeServer({ status: 'submitted' });
  const a = setup(done);
  await a.player.ready;
  assert.deepEqual(a.navigations, [`/mock-tests/result.html?attempt=${ATTEMPT_ID}`]);
  a.player.destroy();

  const closing = fakeServer();
  const b = setup(closing);
  await b.player.ready;
  closing.status = 'submitted';
  b.player.selectOption(1);
  await flush();
  assert.deepEqual(b.navigations, [`/mock-tests/result.html?attempt=${ATTEMPT_ID}`]);
  b.player.destroy();
});

test('shows a clear error for a broken or unknown test link', async () => {
  const server = fakeServer();
  const dom = new JSDOM(TEST_HTML, { url: 'http://127.0.0.1/mock-tests/test.html?attempt=not-valid' });
  const player = createTestPlayer({ document: dom.window.document, window: dom.window, fetch: server.fetch, storage: null, navigate() {}, autoTick: false });
  await player.ready;
  assert.equal(dom.window.document.getElementById('tp-error').hidden, false);
  assert.match(dom.window.document.getElementById('tp-error').textContent, /incomplete/);
  assert.equal(server.calls.length, 0);
  player.destroy();
});

test('instructions page: start requires agreement and confirmation', async () => {
  const dom = new JSDOM(INSTRUCTIONS_HTML, { url: 'http://127.0.0.1/mock-tests/instructions.html?test=sample-test' });
  const doc = dom.window.document;
  const calls = [];
  const navigations = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url === '/api/tests/sample-test') {
      return json(200, {
        exam: { code: 'tg-icet', name: 'TG ICET' },
        test: { id: 'sample-test', title: 'Placeholder test', durationMinutes: 15, questionCount: 9, marksPerQuestion: 1, negativeMarks: 0, instructions: 'Line one\nLine two', sections: [{ name: 'Section A', questionCount: 9 }] },
      });
    }
    if (url === '/api/tests/sample-test/attempts') return json(201, { attempt: { id: ATTEMPT_ID } });
    return json(404, {});
  };
  await initPages({ document: doc, window: dom.window, fetch, storage: dom.window.localStorage, navigate: (u) => navigations.push(u) });

  assert.equal(doc.getElementById('mt-test-title').textContent, 'Placeholder test');
  assert.equal(doc.getElementById('mt-exam-link').getAttribute('href'), '/mock-tests/tg-icet.html');
  assert.equal(doc.querySelectorAll('#mt-test-instructions li').length, 2);
  const start = doc.getElementById('mt-start');
  assert.equal(start.disabled, true);

  const agree = doc.getElementById('mt-agree');
  agree.checked = true;
  agree.dispatchEvent(new dom.window.Event('change'));
  assert.equal(start.disabled, false);

  start.click();
  assert.equal(doc.getElementById('mt-confirm').hidden, false);
  assert.match(doc.getElementById('mt-confirm-text').textContent, /15 minutes/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'nothing starts before confirming');

  doc.getElementById('mt-confirm-start').click();
  await flush();
  assert.deepEqual(navigations, [`/mock-tests/test.html?attempt=${ATTEMPT_ID}`]);
  assert.equal(dom.window.localStorage.getItem('mpf-active-test:sample-test'), ATTEMPT_ID);
});
