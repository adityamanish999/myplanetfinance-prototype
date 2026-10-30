'use strict';

const { sanitizeText } = require('../chat/validation');
const { getExam } = require('./exams');

const LIMITS = Object.freeze({
  titleMin: 3,
  titleMax: 120,
  instructionsMax: 5000,
  sectionNameMax: 80,
  maxSections: 10,
  durationMin: 1,
  durationMax: 300,
  marksMin: 0.25,
  marksMax: 10,
  negativeMax: 10,
  questionTextMax: 2000,
  optionMax: 500,
  minOptions: 2,
  maxOptions: 6,
  explanationMax: 3000,
});

const TEST_FIELDS = new Set(['exam', 'title', 'durationMinutes', 'instructions', 'sections', 'marksPerQuestion', 'negativeMarks', 'published']);
const QUESTION_FIELDS = new Set(['sectionId', 'text', 'options', 'correctOption', 'explanation']);

class ValidationError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkFields(body, allowed) {
  if (!isPlainObject(body)) throw new ValidationError('Request body must be a JSON object.');
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new ValidationError('Request contains unexpected fields.');
}

function text(value, label, { min = 1, max, optional = false }) {
  if ((value === undefined || value === null || value === '') && optional) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text.`);
  const clean = sanitizeText(value);
  if (clean.length < min) throw new ValidationError(min > 1 ? `${label} must be at least ${min} characters.` : `${label} is required.`);
  if (clean.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return clean;
}

function number(value, label, { min, max, integer = false }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new ValidationError(`${label} must be ${integer ? 'a whole number' : 'a number'}.`);
  }
  if (value < min || value > max) throw new ValidationError(`${label} must be between ${min} and ${max}.`);
  return value;
}

function validateSections(value) {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError('Add at least one section.');
  if (value.length > LIMITS.maxSections) throw new ValidationError(`A test can have at most ${LIMITS.maxSections} sections.`);
  const seen = new Set();
  return value.map((section) => {
    if (!isPlainObject(section)) throw new ValidationError('Sections are invalid.');
    const name = text(section.name, 'Section name', { max: LIMITS.sectionNameMax });
    const key = name.toLowerCase();
    if (seen.has(key)) throw new ValidationError(`Section names must be unique ("${name}" is repeated).`);
    seen.add(key);
    const id = section.id === undefined ? undefined : text(section.id, 'Section id', { max: 64 });
    return id ? { id, name } : { name };
  });
}

/** Validates admin input for creating or updating a test. Returns a clean object or throws ValidationError. */
function validateTestInput(body) {
  checkFields(body, TEST_FIELDS);
  if (!getExam(body.exam)) throw new ValidationError('Choose AP ICET or TG ICET.');
  return {
    exam: body.exam,
    title: text(body.title, 'Title', { min: LIMITS.titleMin, max: LIMITS.titleMax }),
    durationMinutes: number(body.durationMinutes, 'Duration (minutes)', { min: LIMITS.durationMin, max: LIMITS.durationMax, integer: true }),
    instructions: text(body.instructions, 'Instructions', { max: LIMITS.instructionsMax, optional: true }),
    sections: validateSections(body.sections),
    marksPerQuestion: number(body.marksPerQuestion, 'Marks per question', { min: LIMITS.marksMin, max: LIMITS.marksMax }),
    negativeMarks: number(body.negativeMarks, 'Negative marks', { min: 0, max: LIMITS.negativeMax }),
    published: body.published === undefined ? false : (() => {
      if (typeof body.published !== 'boolean') throw new ValidationError('Published must be true or false.');
      return body.published;
    })(),
  };
}

/** Validates admin input for a question belonging to `test`. */
function validateQuestionInput(body, test) {
  checkFields(body, QUESTION_FIELDS);
  if (!test.sections.some((section) => section.id === body.sectionId)) throw new ValidationError('Choose a section for this question.');
  if (!Array.isArray(body.options) || body.options.length < LIMITS.minOptions || body.options.length > LIMITS.maxOptions) {
    throw new ValidationError(`Questions need between ${LIMITS.minOptions} and ${LIMITS.maxOptions} options.`);
  }
  const options = body.options.map((option, i) => text(option, `Option ${String.fromCharCode(65 + i)}`, { max: LIMITS.optionMax }));
  const correctOption = number(body.correctOption, 'Correct answer', { min: 0, max: options.length - 1, integer: true });
  return {
    sectionId: body.sectionId,
    text: text(body.text, 'Question text', { max: LIMITS.questionTextMax }),
    options,
    correctOption,
    explanation: text(body.explanation, 'Explanation', { max: LIMITS.explanationMax, optional: true }),
  };
}

module.exports = { LIMITS, ValidationError, validateTestInput, validateQuestionInput };
