'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createMediaLibrary, inspectImage } = require('../../server/content/mediaLibrary');
const { tempDir } = require('./helpers/mockTestFixtures');
const { png, jpeg, webp } = require('./helpers/imageFixtures');

function library(options = {}) {
  const dir = tempDir();
  const store = createJsonStore(path.join(dir, 'media.json'), { initial: { version: 1, items: [] } });
  return { dir, uploads: path.join(dir, 'uploads'), media: createMediaLibrary({ store, dir: path.join(dir, 'uploads'), ...options }) };
}

test('identifies PNG, JPEG and WebP from their bytes, with dimensions', () => {
  assert.deepEqual(inspectImage(png(4, 2)), { type: 'image/png', width: 4, height: 2 });
  assert.deepEqual(inspectImage(jpeg(800, 600)), { type: 'image/jpeg', width: 800, height: 600 });
  assert.deepEqual(inspectImage(webp(1600, 900)), { type: 'image/webp', width: 1600, height: 900 });
  assert.equal(inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(inspectImage(Buffer.from('GIF89a......')), null);
  assert.equal(inspectImage(png().subarray(0, 10)), null, 'truncated file');
});

test('stores a valid image under a random id outside public/', () => {
  const { media, uploads } = library({ idFactory: () => '11111111-2222-4333-8444-555555555555', now: () => '2026-10-29T10:00:00.000Z' });
  const item = media.add(png(4, 2), 'image/png', 'admin');
  assert.deepEqual(item, { id: '11111111-2222-4333-8444-555555555555', type: 'image/png', size: png(4, 2).length, width: 4, height: 2, uploadedAt: '2026-10-29T10:00:00.000Z', uploadedBy: 'admin' });
  assert.equal(media.filePath(item), path.join(uploads, '11111111-2222-4333-8444-555555555555.png'));
  assert.deepEqual(fs.readFileSync(media.filePath(item)), png(4, 2));
  assert.ok(!media.filePath(item).includes(`${path.sep}public${path.sep}`));
  assert.equal(media.exists(item.id), true);
  assert.equal(media.get('../media.json'), null, 'ids that are not UUIDs are never looked up');
});

test('rejects unsupported types, mismatched contents, empty and oversized files', () => {
  const { media, uploads } = library({ maxBytes: 1024, maxDimension: 100 });
  assert.throws(() => media.add(png(), 'image/svg+xml', 'admin'), (e) => e.status === 415);
  assert.throws(() => media.add(png(), 'image/gif', 'admin'), (e) => e.status === 415);
  assert.throws(() => media.add(Buffer.alloc(0), 'image/png', 'admin'), /empty/);
  assert.throws(() => media.add(Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', 'admin'), /not a valid JPEG, PNG or WebP/);
  assert.throws(() => media.add(jpeg(), 'image/png', 'admin'), /do not match its type/);
  assert.throws(() => media.add(Buffer.concat([png(), Buffer.alloc(2048)]), 'image/png', 'admin'), (e) => e.status === 413);
  assert.throws(() => media.add(webp(101, 50), 'image/webp', 'admin'), /at most 100 × 100 pixels/);
  assert.deepEqual(media.list(), []);
  assert.deepEqual(fs.readdirSync(uploads), [], 'nothing is written for rejected files');
});

test('limits the number of stored images', () => {
  const { media } = library({ maxItems: 2 });
  media.add(png(), 'image/png', 'admin');
  media.add(jpeg(), 'image/jpeg', 'admin');
  assert.throws(() => media.add(webp(), 'image/webp', 'admin'), (e) => e.status === 409 && /library is full/.test(e.message));
});

test('deletes unused images and refuses to delete images in use', () => {
  const { media, uploads } = library();
  const used = media.add(png(), 'image/png', 'admin');
  const unused = media.add(jpeg(), 'image/jpeg', 'admin');
  const inUse = (id) => id === used.id;
  assert.throws(() => media.remove(used.id, { inUse }), (e) => e.status === 409);
  media.remove(unused.id, { inUse });
  assert.deepEqual(media.list().map((m) => m.id), [used.id]);
  assert.deepEqual(fs.readdirSync(uploads), [`${used.id}.png`]);
  assert.throws(() => media.remove(unused.id), (e) => e.status === 404);
});

test('image metadata persists across restarts', () => {
  const { dir, media } = library();
  const item = media.add(webp(), 'image/webp', 'admin');
  const reopened = createMediaLibrary({ store: createJsonStore(path.join(dir, 'media.json'), { initial: { version: 1, items: [] } }), dir: path.join(dir, 'uploads') });
  assert.deepEqual(reopened.get(item.id), item);
});
