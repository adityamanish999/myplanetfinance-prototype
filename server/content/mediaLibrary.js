'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../http');
const { MEDIA_ID } = require('./contentValidation');

const TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 6000;
const MAX_ITEMS = 200;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // reached image data before a frame header
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buf) {
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const [b0, b1, b2, b3] = buf.subarray(21, 25);
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

/**
 * Identifies an image from its bytes (never from the file name or the
 * declared type alone). Returns { type, width, height } or null.
 */
function inspectImage(buf) {
  const checks = [['image/png', pngSize], ['image/jpeg', jpegSize], ['image/webp', webpSize]];
  for (const [type, read] of checks) {
    const size = read(buf);
    if (size) return { type, ...size };
  }
  return null;
}

/**
 * Uploaded images on local disk (media storage choice is pending, D5).
 * Files are saved under random ids in a folder outside public/, so a file
 * name or path from the browser is never used. Metadata lives in a JSON store.
 */
function createMediaLibrary({ store, dir, maxBytes = MAX_BYTES, maxDimension = MAX_DIMENSION, maxItems = MAX_ITEMS, now = () => new Date().toISOString(), idFactory = randomUUID }) {
  fs.mkdirSync(dir, { recursive: true });

  function find(id) {
    if (typeof id !== 'string' || !MEDIA_ID.test(id)) return null;
    return store.read().items.find((item) => item.id === id) || null;
  }

  return {
    TYPES,
    maxBytes,

    list() {
      return structuredClone(store.read().items);
    },

    get(id) {
      const item = find(id);
      return item ? structuredClone(item) : null;
    },

    exists(id) {
      return Boolean(find(id));
    },

    filePath(item) {
      return path.join(dir, `${item.id}.${TYPES[item.type]}`);
    },

    add(buffer, declaredType, username) {
      if (!TYPES[declaredType]) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image.');
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, 'INVALID_IMAGE', 'The file is empty.');
      if (buffer.length > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Images must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`);
      const info = inspectImage(buffer);
      if (!info) throw new HttpError(400, 'INVALID_IMAGE', 'This file is not a valid JPEG, PNG or WebP image.');
      if (info.type !== declaredType) throw new HttpError(400, 'INVALID_IMAGE', 'The file contents do not match its type. Upload a JPEG, PNG or WebP image.');
      if (!info.width || !info.height || info.width > maxDimension || info.height > maxDimension) {
        throw new HttpError(400, 'INVALID_IMAGE', `Images must be at most ${maxDimension} × ${maxDimension} pixels.`);
      }
      if (store.read().items.length >= maxItems) throw new HttpError(409, 'LIBRARY_FULL', `The image library is full (${maxItems} images). Delete unused images first.`);

      const item = { id: idFactory(), type: info.type, size: buffer.length, width: info.width, height: info.height, uploadedAt: now(), uploadedBy: username };
      const file = path.join(dir, `${item.id}.${TYPES[item.type]}`);
      fs.writeFileSync(file, buffer, { flag: 'wx', mode: 0o640 });
      try {
        store.update((data) => {
          data.items.push(item);
        });
      } catch (err) {
        fs.rmSync(file, { force: true });
        throw err;
      }
      return structuredClone(item);
    },

    remove(id, { inUse = () => false } = {}) {
      const item = find(id);
      if (!item) throw new HttpError(404, 'NOT_FOUND', 'Image not found.');
      if (inUse(id)) throw new HttpError(409, 'MEDIA_IN_USE', 'This image is used by a banner (draft or published). Remove it from the banner first.');
      store.update((data) => {
        data.items = data.items.filter((i) => i.id !== id);
      });
      fs.rmSync(this.filePath(item), { force: true });
    },
  };
}

/**
 * Sends a stored image with its verified type. The sandbox CSP and nosniff
 * header stop a crafted file from being treated as a page or script.
 */
function sendMedia(res, library, item, cacheControl, next) {
  res.set({
    'Content-Type': item.type,
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cacheControl,
  });
  res.sendFile(library.filePath(item), { dotfiles: 'deny', headers: { 'Content-Type': item.type } }, (err) => {
    if (err && !res.headersSent) next(err);
  });
}

module.exports = { createMediaLibrary, inspectImage, sendMedia, TYPES, MAX_BYTES };
