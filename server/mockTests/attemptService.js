'use strict';

const { randomUUID } = require('node:crypto');
const { HttpError } = require('../http');
const { scoreAttempt } = require('./scoring');

// Answers sent up to this long after the deadline are still accepted (network latency).
const GRACE_MS = 10 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANSWER_FIELDS = new Set(['selectedOption', 'marked']);

const closed = () => new HttpError(409, 'ATTEMPT_CLOSED', 'This test has already been submitted.');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Test attempt not found.');

/** What the test taker may see while the test is running: no correct answers or explanations. */
function toPublicAttempt(attempt, serverNow) {
  return {
    id: attempt.id,
    testId: attempt.testId,
    exam: attempt.exam,
    title: attempt.title,
    status: attempt.status,
    durationMinutes: attempt.durationMinutes,
    startedAt: new Date(attempt.startedAt).toISOString(),
    expiresAt: new Date(attempt.expiresAt).toISOString(),
    serverNow: new Date(serverNow).toISOString(),
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
    autoSubmitted: attempt.autoSubmitted,
    sections: attempt.sections,
    questions: attempt.questions.map((q) => ({ id: q.id, sectionId: q.sectionId, text: q.text, options: q.options })),
    answers: attempt.status === 'submitted' ? {} : attempt.answers,
    marked: attempt.status === 'submitted' ? {} : attempt.marked,
  };
}

/**
 * Runs test attempts. Timing and scoring happen here, never in the browser.
 * Each attempt keeps a snapshot of its questions, so admin edits made during
 * a test do not change it.
 */
function createAttemptService({ store, repository, now = Date.now, idFactory = randomUUID }) {
  function lookup(data, attemptId) {
    if (typeof attemptId !== 'string' || !UUID_PATTERN.test(attemptId)) throw notFound();
    const attempt = data.attempts[attemptId];
    if (!attempt) throw notFound();
    return attempt;
  }

  function finalize(attempt, { auto }) {
    attempt.status = 'submitted';
    attempt.submittedAt = auto ? Math.min(now(), attempt.expiresAt) : now();
    attempt.autoSubmitted = auto;
    attempt.result = scoreAttempt(attempt);
  }

  function isPastDeadline(attempt) {
    return now() > attempt.expiresAt + GRACE_MS;
  }

  /** Auto-submits an expired attempt (e.g. the browser was closed when time ran out). */
  function closeIfExpired(attemptId) {
    const attempt = lookup(store.read(), attemptId);
    if (attempt.status === 'in_progress' && isPastDeadline(attempt)) {
      store.update((data) => finalize(lookup(data, attemptId), { auto: true }));
    }
  }

  return {
    start(testId) {
      const test = repository.getTest(testId);
      if (!test || !test.published || test.questions.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Test not found.');
      const order = new Map(test.sections.map((s, i) => [s.id, i]));
      const questions = [...test.questions]
        .sort((a, b) => order.get(a.sectionId) - order.get(b.sectionId))
        .map(({ id, sectionId, text, options, correctOption, explanation }) => ({ id, sectionId, text, options, correctOption, explanation }));
      const startedAt = now();
      const attempt = {
        id: idFactory(),
        testId: test.id,
        exam: test.exam,
        title: test.title,
        durationMinutes: test.durationMinutes,
        marksPerQuestion: test.marksPerQuestion,
        negativeMarks: test.negativeMarks,
        sections: test.sections.filter((s) => questions.some((q) => q.sectionId === s.id)),
        questions,
        answers: {},
        marked: {},
        status: 'in_progress',
        startedAt,
        expiresAt: startedAt + test.durationMinutes * 60 * 1000,
        submittedAt: null,
        autoSubmitted: false,
        result: null,
      };
      store.update((data) => {
        for (const [id, old] of Object.entries(data.attempts)) {
          if (old.startedAt < startedAt - RETENTION_MS) delete data.attempts[id];
        }
        data.attempts[attempt.id] = attempt;
      });
      return toPublicAttempt(attempt, startedAt);
    },

    get(attemptId) {
      closeIfExpired(attemptId);
      return toPublicAttempt(lookup(store.read(), attemptId), now());
    },

    saveAnswer(attemptId, questionId, body) {
      closeIfExpired(attemptId);
      if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !ANSWER_FIELDS.has(k))) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Answer is invalid.');
      }
      if (body.selectedOption === undefined && body.marked === undefined) throw new HttpError(400, 'INVALID_REQUEST', 'Answer is invalid.');
      if (body.marked !== undefined && typeof body.marked !== 'boolean') throw new HttpError(400, 'INVALID_REQUEST', 'Answer is invalid.');

      return store.update((data) => {
        const attempt = lookup(data, attemptId);
        if (attempt.status !== 'in_progress') throw closed();
        const question = attempt.questions.find((q) => q.id === questionId);
        if (!question) throw new HttpError(404, 'NOT_FOUND', 'Question not found in this test.');
        if (body.selectedOption !== undefined) {
          const option = body.selectedOption;
          if (option === null) delete attempt.answers[questionId];
          else if (Number.isInteger(option) && option >= 0 && option < question.options.length) attempt.answers[questionId] = option;
          else throw new HttpError(400, 'INVALID_REQUEST', 'Answer is invalid.');
        }
        if (body.marked === true) attempt.marked[questionId] = true;
        if (body.marked === false) delete attempt.marked[questionId];
        return { saved: true, answeredCount: Object.keys(attempt.answers).length };
      });
    },

    submit(attemptId) {
      closeIfExpired(attemptId);
      return store.update((data) => {
        const attempt = lookup(data, attemptId);
        if (attempt.status === 'in_progress') finalize(attempt, { auto: false });
        return { id: attempt.id, status: attempt.status, autoSubmitted: attempt.autoSubmitted };
      });
    },

    getResult(attemptId) {
      closeIfExpired(attemptId);
      const attempt = lookup(store.read(), attemptId);
      if (attempt.status !== 'submitted') {
        throw new HttpError(409, 'ATTEMPT_IN_PROGRESS', 'Results are available after the test is submitted.');
      }
      return {
        attemptId: attempt.id,
        testId: attempt.testId,
        exam: attempt.exam,
        title: attempt.title,
        startedAt: new Date(attempt.startedAt).toISOString(),
        submittedAt: new Date(attempt.submittedAt).toISOString(),
        autoSubmitted: attempt.autoSubmitted,
        ...attempt.result,
      };
    },
  };
}

module.exports = { createAttemptService, GRACE_MS };
