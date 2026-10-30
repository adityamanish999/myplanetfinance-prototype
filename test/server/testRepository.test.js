'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createTestRepository } = require('../../server/mockTests/testRepository');
const { tempDir, testInput, questionInput } = require('./helpers/mockTestFixtures');

function setup() {
  const file = path.join(tempDir(), 'mock-tests.json');
  const store = createJsonStore(file, { initial: { version: 1, tests: [] } });
  return { file, repository: createTestRepository(store) };
}

function expectHttpError(fn, status, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test('creates a draft test with generated section ids and persists it', () => {
  const { repository, file } = setup();
  const created = repository.createTest(testInput());
  assert.equal(created.published, false);
  assert.equal(created.sections.length, 2);
  assert.ok(created.sections.every((s) => typeof s.id === 'string' && s.id.length > 0));
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.tests[0].title, 'Placeholder test');
});

test('validates test input', () => {
  const { repository } = setup();
  for (const bad of [
    testInput({ exam: 'ts-icet' }),
    testInput({ title: 'ab' }),
    testInput({ durationMinutes: 0 }),
    testInput({ durationMinutes: 12.5 }),
    testInput({ sections: [] }),
    testInput({ sections: [{ name: 'Same' }, { name: 'same' }] }),
    testInput({ marksPerQuestion: 0 }),
    testInput({ negativeMarks: -1 }),
    { ...testInput(), extra: true },
  ]) {
    expectHttpError(() => repository.createTest(bad), 400, 'INVALID_REQUEST');
  }
});

test('cannot publish a test without questions', () => {
  const { repository } = setup();
  expectHttpError(() => repository.createTest(testInput({ published: true })), 400, 'PUBLISH_REQUIRES_QUESTIONS');
  const draft = repository.createTest(testInput());
  expectHttpError(() => repository.updateTest(draft.id, testInput({ published: true, sections: draft.sections })), 400, 'PUBLISH_REQUIRES_QUESTIONS');
});

test('adds, updates and deletes questions with validation', () => {
  const { repository } = setup();
  const draft = repository.createTest(testInput());
  const sectionId = draft.sections[0].id;

  const q = repository.addQuestion(draft.id, questionInput(sectionId));
  assert.equal(repository.getTest(draft.id).questions.length, 1);

  const updated = repository.updateQuestion(draft.id, q.id, questionInput(sectionId, { text: 'Edited?', correctOption: 3 }));
  assert.equal(updated.text, 'Edited?');
  assert.equal(updated.correctOption, 3);

  for (const bad of [
    questionInput('missing-section'),
    questionInput(sectionId, { options: ['Only one'] }),
    questionInput(sectionId, { options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }),
    questionInput(sectionId, { options: ['A', ''] }),
    questionInput(sectionId, { correctOption: 4 }),
    questionInput(sectionId, { text: '' }),
  ]) {
    expectHttpError(() => repository.addQuestion(draft.id, bad), 400, 'INVALID_REQUEST');
  }

  repository.deleteQuestion(draft.id, q.id);
  assert.equal(repository.getTest(draft.id).questions.length, 0);
  expectHttpError(() => repository.deleteQuestion(draft.id, q.id), 404);
});

test('keeps section ids on rename and blocks removing a section that has questions', () => {
  const { repository } = setup();
  const draft = repository.createTest(testInput());
  const [a, b] = draft.sections;
  repository.addQuestion(draft.id, questionInput(a.id));

  const renamed = repository.updateTest(draft.id, testInput({ sections: [{ id: a.id, name: 'Renamed A' }, { id: b.id, name: 'Section B' }] }));
  assert.equal(renamed.sections[0].id, a.id);
  assert.equal(renamed.sections[0].name, 'Renamed A');

  expectHttpError(() => repository.updateTest(draft.id, testInput({ sections: [{ id: b.id, name: 'Section B' }] })), 409, 'SECTION_IN_USE');
  const withoutB = repository.updateTest(draft.id, testInput({ sections: [{ id: a.id, name: 'Renamed A' }] }));
  assert.equal(withoutB.sections.length, 1);
});

test('refuses to delete the last question of a published test and leaves data unchanged', () => {
  const { repository } = setup();
  const draft = repository.createTest(testInput());
  const q = repository.addQuestion(draft.id, questionInput(draft.sections[0].id));
  repository.updateTest(draft.id, testInput({ published: true, sections: draft.sections }));
  expectHttpError(() => repository.deleteQuestion(draft.id, q.id), 409, 'LAST_QUESTION');
  assert.equal(repository.getTest(draft.id).questions.length, 1);
});

test('lists published tests per exam', () => {
  const { repository } = setup();
  const ap = repository.createTest(testInput({ exam: 'ap-icet' }));
  repository.addQuestion(ap.id, questionInput(ap.sections[0].id));
  repository.updateTest(ap.id, testInput({ exam: 'ap-icet', published: true, sections: ap.sections }));
  repository.createTest(testInput({ exam: 'tg-icet' }));

  assert.equal(repository.listTests({ exam: 'ap-icet', publishedOnly: true }).length, 1);
  assert.equal(repository.listTests({ exam: 'tg-icet', publishedOnly: true }).length, 0);
  assert.equal(repository.listTests().length, 2);
});

test('returns copies so callers cannot mutate stored data', () => {
  const { repository } = setup();
  const draft = repository.createTest(testInput());
  repository.getTest(draft.id).title = 'Hacked';
  assert.equal(repository.getTest(draft.id).title, 'Placeholder test');
});
