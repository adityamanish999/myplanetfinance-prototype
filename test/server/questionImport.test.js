'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createTestRepository } = require('../../server/mockTests/testRepository');
const { parseQuestionBank, importQuestionBank } = require('../../server/mockTests/questionImport');
const { tempDir } = require('./helpers/mockTestFixtures');

const TG_BANK = require('../../data/question-banks/tg-icet-practice-set-1.json');

function q(overrides = {}) {
  return { section: 'Section A', question: 'Placeholder?', options: ['One', 'Two', 'Three', 'Four'], answer: 'B', ...overrides };
}

function repo() {
  return createTestRepository(createJsonStore(path.join(tempDir(), 'mock-tests.json'), { initial: { version: 1, tests: [] } }));
}

test('parses the supplied TG ICET file: 30 questions, 3 sections, one duplicate-option warning', () => {
  const bank = parseQuestionBank(TG_BANK);
  assert.equal(bank.title, 'TG ICET Practice Set 1');
  assert.equal(bank.questions.length, 30);
  assert.deepEqual(bank.sections, ['Mathematical Ability', 'Analytical Ability', 'Communication Ability']);
  assert.deepEqual(bank.errors, []);
  assert.deepEqual(bank.warnings, [{ number: 8, message: 'Options A and B are identical ("HTRON").' }]);
  assert.equal(bank.questions[0].correctOption, 1, 'answer "B" maps to the second option');
});

test('parses the supplied AP ICET file: 30 questions, 3 sections, no problems', () => {
  const bank = parseQuestionBank(require('../../data/question-banks/ap-icet-practice-set-1.json'));
  assert.equal(bank.title, 'AP ICET Practice Set 1');
  assert.equal(bank.questions.length, 30);
  assert.deepEqual(bank.sections, ['Mathematical Ability', 'Analytical Ability', 'Communication Ability']);
  assert.deepEqual(bank.errors, []);
  assert.deepEqual(bank.warnings, []);
});

test('accepts "subject" as the section name and converts answer letters', () => {
  const bank = parseQuestionBank({ exam: 'Placeholder', questions: [q({ section: undefined, subject: 'Physics', answer: 'd' })] });
  assert.equal(bank.questions[0].section, 'Physics');
  assert.equal(bank.questions[0].correctOption, 3);
});

test('reports and skips invalid or incomplete questions without guessing', () => {
  const bank = parseQuestionBank({
    exam: 'Placeholder',
    totalQuestions: 6,
    questions: [
      q(),
      q({ answer: 'E' }),
      q({ options: ['Only one'] }),
      q({ question: '' }),
      { section: 'Section A', question: 'Which of the following is an acid?' },
    ],
  });
  assert.equal(bank.questions.length, 1);
  assert.deepEqual(bank.errors.map((e) => e.number), [2, 3, 4, 5]);
  assert.match(bank.errors[0].message, /Answer "E" does not match/);
  assert.match(bank.warnings[0].message, /says 6, but the file contains 5/);
});

test('flags repeated question text', () => {
  const bank = parseQuestionBank({ exam: 'Placeholder', questions: [q(), q()] });
  assert.equal(bank.questions.length, 2);
  assert.match(bank.warnings[0].message, /Same question text as question 1/);
});

test('imports a bank as a published test with sections and answers intact', () => {
  const repository = repo();
  const bank = parseQuestionBank(TG_BANK);
  const created = importQuestionBank(repository, bank, { exam: 'tg-icet', durationMinutes: 45, publish: true });
  assert.equal(created.published, true);
  assert.equal(created.questions.length, 30);
  assert.equal(created.durationMinutes, 45);
  assert.deepEqual(created.sections.map((s) => s.name), bank.sections);
  const first = created.questions[0];
  assert.equal(first.text, '30% of 500 is:');
  assert.equal(first.correctOption, 1);
  assert.equal(created.sections.find((s) => s.id === first.sectionId).name, 'Mathematical Ability');
});

test('imports as a draft by default and refuses duplicate titles', () => {
  const repository = repo();
  const bank = parseQuestionBank(TG_BANK);
  assert.equal(importQuestionBank(repository, bank, { exam: 'tg-icet', durationMinutes: 45 }).published, false);
  assert.throws(() => importQuestionBank(repository, bank, { exam: 'tg-icet', durationMinutes: 45 }), /already exists/);
  assert.doesNotThrow(() => importQuestionBank(repository, bank, { exam: 'ap-icet', durationMinutes: 45 }));
});
