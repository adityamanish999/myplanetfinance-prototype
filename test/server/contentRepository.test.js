'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createContentRepository, initialContent } = require('../../server/content/contentRepository');
const { tempDir } = require('./helpers/mockTestFixtures');

const SEED = require('../../data/seed/site-content.json');
const IMAGE_ID = '11111111-2222-4333-8444-555555555555';

function setup({ images = new Set([IMAGE_ID]) } = {}) {
  const file = path.join(tempDir(), 'site-content.json');
  const open = () => createContentRepository(createJsonStore(file, { initial: () => initialContent(SEED) }), {
    mediaExists: (id) => images.has(id),
    now: () => '2026-10-29T10:00:00.000Z',
  });
  return { open, images, repo: open() };
}

function edited(mutate) {
  const value = structuredClone(SEED);
  mutate(value);
  return value;
}

test('starts with the seed content published and no pending changes', () => {
  const { repo } = setup();
  const state = repo.getState();
  assert.deepEqual(state.draft, SEED);
  assert.deepEqual(state.published, SEED);
  assert.equal(state.hasUnpublishedChanges, false);
  assert.equal(state.publishedAt, null);
});

test('saving a draft does not change the published content', () => {
  const { repo } = setup();
  const state = repo.saveDraft(edited((c) => { c.sections.videos.heading = 'Draft heading'; }), 'admin');
  assert.equal(state.draft.sections.videos.heading, 'Draft heading');
  assert.equal(state.hasUnpublishedChanges, true);
  assert.equal(state.draftUpdatedBy, 'admin');
  assert.equal(repo.getPublished().sections.videos.heading, 'Videos');
});

test('invalid drafts are rejected with a 400 and leave stored content unchanged', () => {
  const { repo } = setup();
  assert.throws(() => repo.saveDraft(edited((c) => { c.hero.slides[0].heading = ''; }), 'admin'), (e) => e.status === 400 && e.code === 'INVALID_REQUEST');
  assert.throws(() => repo.saveDraft({ hero: 'x' }, 'admin'), (e) => e.status === 400);
  assert.deepEqual(repo.getDraft(), SEED);
});

test('publish copies the draft to the live content; discard resets the draft', () => {
  const { repo } = setup();
  repo.saveDraft(edited((c) => { c.sections.videos.heading = 'Version 2'; }), 'admin');
  const published = repo.publish('admin');
  assert.equal(published.published.sections.videos.heading, 'Version 2');
  assert.equal(published.hasUnpublishedChanges, false);
  assert.equal(published.publishedBy, 'admin');
  assert.equal(published.publishedAt, '2026-10-29T10:00:00.000Z');

  repo.saveDraft(edited((c) => { c.sections.videos.heading = 'Version 3 (not wanted)'; }), 'admin');
  const discarded = repo.discardDraft('admin');
  assert.equal(discarded.draft.sections.videos.heading, 'Version 2');
  assert.equal(discarded.hasUnpublishedChanges, false);
});

test('publish refuses a draft whose image was deleted after it was saved', () => {
  const { repo, images } = setup();
  repo.saveDraft(edited((c) => { c.hero.slides[0].imageId = IMAGE_ID; c.hero.slides[0].imageAlt = 'Campus'; }), 'admin');
  assert.equal(repo.isMediaInUse(IMAGE_ID), true);
  assert.equal(repo.isMediaPublished(IMAGE_ID), false);
  images.delete(IMAGE_ID);
  assert.throws(() => repo.publish('admin'), /image no longer exists/);
  assert.equal(repo.getPublished().hero.slides[0].imageId, null);
});

test('drafts and published content persist across restarts', () => {
  const { repo, open } = setup();
  repo.saveDraft(edited((c) => { c.sections.videos.heading = 'Published'; }), 'admin');
  repo.publish('admin');
  repo.saveDraft(edited((c) => { c.sections.videos.heading = 'Draft only'; }), 'admin');
  const reopened = open();
  assert.equal(reopened.getPublished().sections.videos.heading, 'Published');
  assert.equal(reopened.getDraft().sections.videos.heading, 'Draft only');
  assert.equal(reopened.getState().hasUnpublishedChanges, true);
});

test('returns copies so callers cannot change stored content', () => {
  const { repo } = setup();
  repo.getPublished().sections.videos.heading = 'mutated';
  repo.getState().draft.sections.videos.heading = 'mutated';
  assert.equal(repo.getPublished().sections.videos.heading, 'Videos');
  assert.equal(repo.getDraft().sections.videos.heading, 'Videos');
});
