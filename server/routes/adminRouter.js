'use strict';

const express = require('express');
const { HttpError, sendError, rateLimit, requireJson } = require('../http');
const { listExams } = require('../mockTests/exams');
const { toAdminTestSummary } = require('../mockTests/testRepository');
const { addContentRoutes } = require('./contentAdminRoutes');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site writes. The session cookie is SameSite=Strict and writes
 * must be JSON (which cross-site forms cannot send), and when the browser
 * reports an Origin it must match this server.
 */
function sameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.get('host')) return sendError(res, 403, 'FORBIDDEN', 'Request blocked.');
  }
  next();
}

/**
 * Admin API for mock tests and question banks, plus website content when
 * `content` ({ repository, media, renderPreview }) is provided.
 */
function createAdminRouter({ auth, repository, loginLimiter, content, logger = console }) {
  const router = express.Router();
  const json = express.json({ limit: '64kb' });

  router.use((req, res, next) => {
    if (!auth.enabled) {
      return sendError(res, 503, 'ADMIN_DISABLED', 'Admin is not set up on this server yet. See "Admin setup" in the README.');
    }
    next();
  });
  router.use(sameOrigin);

  router.post('/login', rateLimit(loginLimiter, 'Too many sign-in attempts. Please wait 15 minutes and try again.'), requireJson, json, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 100 || password.length > 200) {
      return sendError(res, 400, 'INVALID_REQUEST', 'Enter your username and password.');
    }
    const token = auth.login(username, password);
    if (!token) {
      logger.warn('[admin] failed sign-in attempt');
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
    }
    res.set('Set-Cookie', auth.sessionCookie(token));
    res.json({ username });
  });

  router.post('/logout', (req, res) => {
    auth.logout(auth.readToken(req));
    res.set('Set-Cookie', auth.clearCookie());
    res.json({ ok: true });
  });

  router.get('/session', (req, res) => {
    const session = auth.getSession(auth.readToken(req));
    if (!session) return sendError(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
    res.json({ username: session.username });
  });

  // Everything below requires a signed-in admin.
  router.use((req, res, next) => {
    const session = auth.getSession(auth.readToken(req));
    if (!session) return sendError(res, 401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
    req.adminSession = session;
    next();
  });

  if (content) addContentRoutes(router, { ...content, logger });

  router.get('/exams', (req, res) => res.json({ exams: listExams() }));

  router.get('/tests', (req, res) => {
    res.json({ tests: repository.listTests().map(toAdminTestSummary) });
  });

  router.post('/tests', requireJson, json, (req, res) => {
    res.status(201).json({ test: repository.createTest(req.body) });
  });

  router.get('/tests/:testId', (req, res) => {
    const test = repository.getTest(req.params.testId);
    if (!test) throw new HttpError(404, 'NOT_FOUND', 'Test not found.');
    res.json({ test });
  });

  router.put('/tests/:testId', requireJson, json, (req, res) => {
    res.json({ test: repository.updateTest(req.params.testId, req.body) });
  });

  router.post('/tests/:testId/questions', requireJson, json, (req, res) => {
    res.status(201).json({ question: repository.addQuestion(req.params.testId, req.body) });
  });

  router.put('/tests/:testId/questions/:questionId', requireJson, json, (req, res) => {
    res.json({ question: repository.updateQuestion(req.params.testId, req.params.questionId, req.body) });
  });

  router.delete('/tests/:testId/questions/:questionId', (req, res) => {
    repository.deleteQuestion(req.params.testId, req.params.questionId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminRouter };
