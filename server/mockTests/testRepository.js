'use strict';

const { randomUUID } = require('node:crypto');
const { HttpError } = require('../http');
const { ValidationError, validateTestInput, validateQuestionInput } = require('./testValidation');

function invalid(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ValidationError) throw new HttpError(400, 'INVALID_REQUEST', err.message);
    throw err;
  }
}

function notFound(what) {
  return new HttpError(404, 'NOT_FOUND', `${what} not found.`);
}

/** Public, answer-free summary of a test for entry and instructions pages. */
function toPublicTestSummary(test) {
  return {
    id: test.id,
    exam: test.exam,
    title: test.title,
    durationMinutes: test.durationMinutes,
    instructions: test.instructions,
    marksPerQuestion: test.marksPerQuestion,
    negativeMarks: test.negativeMarks,
    questionCount: test.questions.length,
    sections: test.sections.map((section) => ({
      name: section.name,
      questionCount: test.questions.filter((q) => q.sectionId === section.id).length,
    })),
  };
}

function toAdminTestSummary(test) {
  return { ...toPublicTestSummary(test), published: test.published, updatedAt: test.updatedAt };
}

/**
 * Tests and their question banks. All writes are validated before the store
 * is touched; a published test must always have at least one question.
 */
function createTestRepository(store, { now = () => new Date().toISOString(), idFactory = randomUUID } = {}) {
  function findTest(data, testId) {
    const test = data.tests.find((t) => t.id === testId);
    if (!test) throw notFound('Test');
    return test;
  }

  function assertPublishable(test) {
    if (test.published && test.questions.length === 0) {
      throw new HttpError(400, 'PUBLISH_REQUIRES_QUESTIONS', 'Add at least one question before publishing this test.');
    }
  }

  function mergeSections(existing, incoming, questions) {
    const existingIds = new Set(existing.map((s) => s.id));
    const sections = incoming.map((s) => {
      if (s.id && !existingIds.has(s.id)) throw new HttpError(400, 'INVALID_REQUEST', 'Sections are invalid.');
      return { id: s.id || idFactory(), name: s.name };
    });
    const kept = new Set(sections.map((s) => s.id));
    const removedInUse = existing.find((s) => !kept.has(s.id) && questions.some((q) => q.sectionId === s.id));
    if (removedInUse) {
      throw new HttpError(409, 'SECTION_IN_USE', `Move or delete the questions in "${removedInUse.name}" before removing that section.`);
    }
    return sections;
  }

  return {
    listTests({ exam, publishedOnly = false } = {}) {
      return store
        .read()
        .tests.filter((t) => (!exam || t.exam === exam) && (!publishedOnly || t.published))
        .map((t) => structuredClone(t));
    },

    getTest(testId) {
      const test = store.read().tests.find((t) => t.id === testId);
      return test ? structuredClone(test) : null;
    },

    createTest(body) {
      const input = invalid(() => validateTestInput(body));
      const timestamp = now();
      const test = {
        id: idFactory(),
        ...input,
        sections: mergeSections([], input.sections.map((s) => ({ name: s.name })), []),
        questions: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assertPublishable(test);
      store.update((data) => {
        data.tests.push(test);
      });
      return structuredClone(test);
    },

    updateTest(testId, body) {
      const input = invalid(() => validateTestInput(body));
      return store.update((data) => {
        const test = findTest(data, testId);
        const sections = mergeSections(test.sections, input.sections, test.questions);
        Object.assign(test, input, { sections, updatedAt: now() });
        assertPublishable(test);
        return structuredClone(test);
      });
    },

    addQuestion(testId, body) {
      return store.update((data) => {
        const test = findTest(data, testId);
        const input = invalid(() => validateQuestionInput(body, test));
        const timestamp = now();
        const question = { id: idFactory(), ...input, createdAt: timestamp, updatedAt: timestamp };
        test.questions.push(question);
        test.updatedAt = timestamp;
        return structuredClone(question);
      });
    },

    updateQuestion(testId, questionId, body) {
      return store.update((data) => {
        const test = findTest(data, testId);
        const question = test.questions.find((q) => q.id === questionId);
        if (!question) throw notFound('Question');
        const input = invalid(() => validateQuestionInput(body, test));
        Object.assign(question, input, { updatedAt: now() });
        test.updatedAt = question.updatedAt;
        return structuredClone(question);
      });
    },

    deleteQuestion(testId, questionId) {
      store.update((data) => {
        const test = findTest(data, testId);
        const index = test.questions.findIndex((q) => q.id === questionId);
        if (index === -1) throw notFound('Question');
        test.questions.splice(index, 1);
        test.updatedAt = now();
        if (test.published && test.questions.length === 0) {
          throw new HttpError(409, 'LAST_QUESTION', 'A published test needs at least one question. Unpublish the test first.');
        }
      });
    },
  };
}

module.exports = { createTestRepository, toPublicTestSummary, toAdminTestSummary };
