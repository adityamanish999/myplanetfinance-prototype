'use strict';

const { HttpError } = require('../http');
const { validateSiteContent, mediaIdsIn, ValidationError } = require('./contentValidation');

/**
 * Editable site content with a draft and a published copy. Admins edit the
 * draft and preview it; visitors only ever see the published copy, which
 * changes only through publish().
 *
 * Stored shape: { version, draft, published, draftUpdatedAt, draftUpdatedBy, publishedAt, publishedBy }
 */
function createContentRepository(store, { mediaExists = () => false, now = () => new Date().toISOString() } = {}) {
  function validate(body) {
    try {
      return validateSiteContent(body, { mediaExists });
    } catch (err) {
      if (err instanceof ValidationError) throw new HttpError(400, 'INVALID_REQUEST', err.message);
      throw err;
    }
  }

  function state(data) {
    return {
      draft: structuredClone(data.draft),
      published: structuredClone(data.published),
      hasUnpublishedChanges: JSON.stringify(data.draft) !== JSON.stringify(data.published),
      draftUpdatedAt: data.draftUpdatedAt || null,
      draftUpdatedBy: data.draftUpdatedBy || null,
      publishedAt: data.publishedAt || null,
      publishedBy: data.publishedBy || null,
    };
  }

  return {
    getState() {
      return state(store.read());
    },

    getDraft() {
      return structuredClone(store.read().draft);
    },

    getPublished() {
      return structuredClone(store.read().published);
    },

    saveDraft(body, username) {
      const clean = validate(body);
      return store.update((data) => {
        data.draft = clean;
        data.draftUpdatedAt = now();
        data.draftUpdatedBy = username;
        return state(data);
      });
    },

    publish(username) {
      // Re-check the draft: an image it uses may have been deleted since it was saved.
      const clean = validate(store.read().draft);
      return store.update((data) => {
        data.draft = clean;
        data.published = structuredClone(clean);
        data.publishedAt = now();
        data.publishedBy = username;
        return state(data);
      });
    },

    discardDraft(username) {
      return store.update((data) => {
        data.draft = structuredClone(data.published);
        data.draftUpdatedAt = now();
        data.draftUpdatedBy = username;
        return state(data);
      });
    },

    isMediaInUse(id) {
      const data = store.read();
      return mediaIdsIn(data.draft).includes(id) || mediaIdsIn(data.published).includes(id);
    },

    isMediaPublished(id) {
      return mediaIdsIn(store.read().published).includes(id);
    },
  };
}

/** Builds the first-run stored value from the seed content. */
function initialContent(seed) {
  return { version: 1, draft: structuredClone(seed), published: structuredClone(seed), draftUpdatedAt: null, draftUpdatedBy: null, publishedAt: null, publishedBy: null };
}

module.exports = { createContentRepository, initialContent };
