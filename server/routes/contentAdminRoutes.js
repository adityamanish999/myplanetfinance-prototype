'use strict';

const express = require('express');
const { HttpError, sendError, requireJson } = require('../http');
const { sendMedia } = require('../content/mediaLibrary');

function adminMediaUrl(id) {
  return `/api/admin/media/${id}/file`;
}

/** Accepts a raw JPEG/PNG/WebP request body (no multipart parsing, no file names from the browser). */
function imageBody(media) {
  const types = Object.keys(media.TYPES);
  const parse = express.raw({ type: types, limit: media.maxBytes });
  const maxMb = Math.floor(media.maxBytes / 1024 / 1024);
  return (req, res, next) => {
    if (!req.is(types)) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image.');
    parse(req, res, (err) => {
      if (err && err.type === 'entity.too.large') return sendError(res, 413, 'PAYLOAD_TOO_LARGE', `Images must be ${maxMb} MB or smaller.`);
      next(err);
    });
  };
}

/**
 * Website content routes, mounted on the admin router after the sign-in
 * check, so every route here requires an admin session.
 */
function addContentRoutes(router, { repository, media, renderPreview, logger = console }) {
  const json = express.json({ limit: '64kb' });

  function mediaList() {
    return media.list().map((item) => ({ ...item, url: adminMediaUrl(item.id), inUse: repository.isMediaInUse(item.id) }));
  }

  router.get('/content', (req, res) => {
    res.json({ content: repository.getState(), media: mediaList() });
  });

  router.put('/content/draft', requireJson, json, (req, res) => {
    res.json({ content: repository.saveDraft(req.body, req.adminSession.username) });
  });

  router.post('/content/publish', requireJson, json, (req, res) => {
    const content = repository.publish(req.adminSession.username);
    logger.info?.(`[admin] content published by ${req.adminSession.username}`);
    res.json({ content });
  });

  router.post('/content/discard', requireJson, json, (req, res) => {
    res.json({ content: repository.discardDraft(req.adminSession.username) });
  });

  router.get('/content/preview', async (req, res) => {
    const html = await renderPreview(repository.getDraft());
    res.type('html').send(html);
  });

  router.get('/media', (req, res) => res.json({ media: mediaList() }));

  router.post('/media', imageBody(media), (req, res) => {
    const item = media.add(req.body, req.is(Object.keys(media.TYPES)), req.adminSession.username);
    res.status(201).json({ media: { ...item, url: adminMediaUrl(item.id), inUse: false } });
  });

  router.get('/media/:id/file', (req, res, next) => {
    const item = media.get(req.params.id);
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Image not found.');
    sendMedia(res, media, item, 'private, no-store', next);
  });

  router.delete('/media/:id', (req, res) => {
    media.remove(req.params.id, { inUse: repository.isMediaInUse });
    res.json({ ok: true });
  });
}

module.exports = { addContentRoutes };
