'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../public/js/mock-test-core');

test('formatDuration', () => {
  assert.equal(core.formatDuration(0), '00:00');
  assert.equal(core.formatDuration(-5000), '00:00');
  assert.equal(core.formatDuration(59 * 1000 + 1), '01:00', 'rounds partial seconds up');
  assert.equal(core.formatDuration(15 * 60 * 1000), '15:00');
  assert.equal(core.formatDuration(150 * 60 * 1000), '2:30:00');
});

test('questionStatus covers all palette states', () => {
  assert.equal(core.questionStatus({}), 'not-visited');
  assert.equal(core.questionStatus({ visited: true }), 'not-answered');
  assert.equal(core.questionStatus({ visited: true, answered: true }), 'answered');
  assert.equal(core.questionStatus({ visited: true, marked: true }), 'marked');
  assert.equal(core.questionStatus({ visited: true, answered: true, marked: true }), 'answered-marked');
  Object.keys(core.STATUS_LABELS).forEach((key) => assert.ok(core.STATUS_LABELS[key]));
});

test('summarize counts answered, unanswered and marked', () => {
  const questions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(core.summarize(questions, { a: 0, c: 2 }, { b: true, c: true }), { total: 3, answered: 2, unanswered: 1, marked: 2 });
});

test('applyPending overlays unsynced local changes on server state', () => {
  const merged = core.applyPending({ a: 1, b: 2 }, { a: true }, { a: { selectedOption: null, marked: false }, c: { selectedOption: 0 }, b: { marked: true } });
  assert.deepEqual(merged, { answers: { b: 2, c: 0 }, marked: { b: true } });
  assert.deepEqual(core.applyPending({ a: 1 }, {}, undefined), { answers: { a: 1 }, marked: {} });
});
