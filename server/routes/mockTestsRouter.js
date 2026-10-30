'use strict';

const express = require('express');
const { HttpError, rateLimit, requireJson } = require('../http');
const { getExam, listExams } = require('../mockTests/exams');
const { toPublicTestSummary } = require('../mockTests/testRepository');

/** Public mock-test API: browsing published tests and taking them. */
function createMockTestsRouter({ repository, attemptService, startLimiter, writeLimiter }) {
  const router = express.Router();
  const json = express.json({ limit: '4kb' });

  router.get('/exams', (req, res) => {
    res.json({
      exams: listExams().map((exam) => ({ ...exam, testCount: repository.listTests({ exam: exam.code, publishedOnly: true }).length })),
    });
  });

  router.get('/exams/:exam/tests', (req, res) => {
    const exam = getExam(req.params.exam);
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Exam not found.');
    res.json({ exam, tests: repository.listTests({ exam: exam.code, publishedOnly: true }).map(toPublicTestSummary) });
  });

  router.get('/tests/:testId', (req, res) => {
    const test = repository.getTest(req.params.testId);
    if (!test || !test.published) throw new HttpError(404, 'NOT_FOUND', 'Test not found.');
    res.json({ test: toPublicTestSummary(test), exam: getExam(test.exam) });
  });

  router.post('/tests/:testId/attempts', rateLimit(startLimiter), (req, res) => {
    res.status(201).json({ attempt: attemptService.start(req.params.testId) });
  });

  router.get('/attempts/:attemptId', (req, res) => {
    res.json({ attempt: attemptService.get(req.params.attemptId) });
  });

  router.put('/attempts/:attemptId/answers/:questionId', rateLimit(writeLimiter), requireJson, json, (req, res) => {
    res.json(attemptService.saveAnswer(req.params.attemptId, req.params.questionId, req.body));
  });

  router.post('/attempts/:attemptId/submit', rateLimit(writeLimiter), (req, res) => {
    res.json({ attempt: attemptService.submit(req.params.attemptId) });
  });

  router.get('/attempts/:attemptId/result', (req, res) => {
    res.json({ result: attemptService.getResult(req.params.attemptId) });
  });

  return router;
}

module.exports = { createMockTestsRouter };
