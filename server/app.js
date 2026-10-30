'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { validateChatRequest } = require('./chat/validation');
const { ChatServiceError } = require('./chat/chatService');
const { renderPage } = require('./content/siteContent');
const { socialLinksFrom } = require('./content/contentValidation');
const { sendMedia } = require('./content/mediaLibrary');
const { HttpError, sendError, requireJson, rateLimit } = require('./http');
const { createMockTestsRouter } = require('./routes/mockTestsRouter');
const { createAdminRouter } = require('./routes/adminRouter');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_HOMEPAGE = require('../data/seed/site-content.json');
const JSON_BODY_LIMIT = '16kb';
// Public pages that contain content placeholders (e.g. social links).
const PAGES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/mock-tests.html': 'mock-tests.html',
  '/apply.html': 'apply.html',
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

/**
 * `mockTests` ({ repository, attemptService, startLimiter, writeLimiter }),
 * `admin` ({ auth, repository, loginLimiter }) and `content` ({ repository, media })
 * are optional; their routes are only mounted when provided. Without `content`,
 * pages use `siteContent.socialLinks` and the seed homepage text.
 */
function createApp({ chatService, rateLimiter, siteContent = { socialLinks: [] }, mockTests, admin, content, logger = console }) {
  const app = express();

  function imageLookup(urlFor) {
    return (id) => {
      const item = content.media.get(id);
      return item ? { url: urlFor(id), width: item.width, height: item.height } : null;
    };
  }

  /** What visitors see: the published content only. */
  function publishedView() {
    if (!content) return { socialLinks: siteContent.socialLinks, homepage: DEFAULT_HOMEPAGE };
    const published = content.repository.getPublished();
    return { socialLinks: socialLinksFrom(published), homepage: published, image: imageLookup((id) => `/media/${id}`) };
  }

  async function renderPreview(draft) {
    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    return renderPage(html, {
      socialLinks: socialLinksFrom(draft),
      homepage: draft,
      image: imageLookup((id) => `/api/admin/media/${id}/file`),
      preview: true,
    });
  }
  app.disable('x-powered-by');
  app.use(securityHeaders);

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.post(
    '/api/chat',
    rateLimit(rateLimiter, "You're sending messages too quickly. Please wait a moment and try again."),
    requireJson,
    express.json({ limit: JSON_BODY_LIMIT }),
    async (req, res) => {
      const validation = validateChatRequest(req.body);
      if (!validation.ok) return sendError(res, 400, 'INVALID_REQUEST', validation.error);

      try {
        const { reply } = await chatService.reply(validation.value);
        res.json({ reply });
      } catch (err) {
        if (err instanceof ChatServiceError) return sendError(res, err.status, err.code, err.publicMessage);
        throw err;
      }
    },
  );

  if (mockTests) app.use('/api', createMockTestsRouter(mockTests));
  if (admin) {
    const contentAdmin = content ? { ...content, renderPreview } : undefined;
    app.use('/api/admin', createAdminRouter({ ...admin, content: contentAdmin, logger }));
  }

  app.use('/api', (req, res) => sendError(res, 404, 'NOT_FOUND', 'Not found.'));

  app.get(Object.keys(PAGES), async (req, res) => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, PAGES[req.path]), 'utf8');
    res.set('Cache-Control', 'no-cache').type('html').send(renderPage(html, publishedView()));
  });

  // Uploaded images are public only once a published banner uses them.
  if (content) {
    app.get('/media/:id', (req, res, next) => {
      const item = content.media.get(req.params.id);
      if (!item || !content.repository.isMediaPublished(item.id)) return res.status(404).type('text').send('Not found');
      sendMedia(res, content.media, item, 'public, max-age=300', next);
    });
  }

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', dotfiles: 'ignore' }));

  // Final error handler: never leak stack traces or internal messages.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return sendError(res, err.status, err.code, err.publicMessage);
    if (err.type === 'entity.parse.failed') {
      return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    }
    if (err.type === 'entity.too.large') {
      return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request is too large.');
    }
    logger.error(`[server] unhandled error: ${err?.name || 'Error'}`);
    sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
  });

  return app;
}

module.exports = { createApp };
