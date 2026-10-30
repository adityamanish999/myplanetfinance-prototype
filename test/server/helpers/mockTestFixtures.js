'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJsonStore } = require('../../../server/storage/jsonStore');
const { createTestRepository } = require('../../../server/mockTests/testRepository');
const { createAttemptService } = require('../../../server/mockTests/attemptService');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mpf-tests-'));
}

function fakeClock(start = Date.UTC(2026, 9, 29, 9, 0, 0)) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; }, set: (ms) => { time = ms; } };
}

/** A valid admin payload for creating a test (placeholder content only). */
function testInput(overrides = {}) {
  return {
    exam: 'ap-icet',
    title: 'Placeholder test',
    durationMinutes: 10,
    instructions: 'Line one\nLine two',
    sections: [{ name: 'Section A' }, { name: 'Section B' }],
    marksPerQuestion: 1,
    negativeMarks: 0,
    published: false,
    ...overrides,
  };
}

function questionInput(sectionId, overrides = {}) {
  return {
    sectionId,
    text: 'Placeholder question?',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctOption: 1,
    explanation: 'Placeholder explanation.',
    ...overrides,
  };
}

/** Creates a repository + attempt service on temp files, with one published test of `count` questions. */
function setupEngine({ count = 4, negativeMarks = 0, clock = fakeClock() } = {}) {
  const dir = tempDir();
  const testStore = createJsonStore(path.join(dir, 'mock-tests.json'), { initial: { version: 1, tests: [] } });
  const attemptStore = createJsonStore(path.join(dir, 'attempts.json'), { initial: { version: 1, attempts: {} } });
  const repository = createTestRepository(testStore);
  const draft = repository.createTest(testInput({ negativeMarks }));
  const [a, b] = draft.sections;
  for (let i = 0; i < count; i++) {
    repository.addQuestion(draft.id, questionInput(i % 2 === 0 ? a.id : b.id, { text: `Placeholder question ${i + 1}?`, correctOption: i % 4 }));
  }
  const test = repository.updateTest(draft.id, testInput({ negativeMarks, published: true, sections: draft.sections }));
  const attempts = createAttemptService({ store: attemptStore, repository, now: clock.now });
  return { dir, repository, attempts, test, clock, attemptStore };
}

module.exports = { tempDir, fakeClock, testInput, questionInput, setupEngine };
