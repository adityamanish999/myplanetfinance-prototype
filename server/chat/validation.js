'use strict';

const LIMITS = Object.freeze({
  maxMessageLength: 1000,
  maxHistoryItems: 20,
  maxHistoryContentLength: 2000,
});

const ALLOWED_FIELDS = new Set(['message', 'history']);
const ALLOWED_ROLES = new Set(['user', 'assistant']);
// Control characters except tab (\u0009), newline (\u000A) and carriage return (\u000D).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeText(value) {
  return value.replace(CONTROL_CHARS, '').trim();
}

function fail(message) {
  return { ok: false, error: message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates and normalises a POST /api/chat body.
 * Returns { ok: true, value: { message, history } } or { ok: false, error }.
 * Error strings are safe to show to the user.
 */
function validateChatRequest(body) {
  if (!isPlainObject(body)) return fail('Request body must be a JSON object.');

  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return fail('Request contains unexpected fields.');
  }

  if (typeof body.message !== 'string') return fail('Message must be text.');
  const message = sanitizeText(body.message);
  if (!message) return fail('Please enter a message.');
  if (message.length > LIMITS.maxMessageLength) {
    return fail(`Messages must be ${LIMITS.maxMessageLength} characters or fewer.`);
  }

  const rawHistory = body.history === undefined ? [] : body.history;
  if (!Array.isArray(rawHistory)) return fail('History must be a list.');
  if (rawHistory.length > LIMITS.maxHistoryItems) {
    return fail(`History must contain ${LIMITS.maxHistoryItems} items or fewer.`);
  }

  const history = [];
  for (const item of rawHistory) {
    if (!isPlainObject(item) || !ALLOWED_ROLES.has(item.role) || typeof item.content !== 'string') {
      return fail('History items are invalid.');
    }
    const content = sanitizeText(item.content);
    if (!content || content.length > LIMITS.maxHistoryContentLength) {
      return fail('History items are invalid.');
    }
    history.push({ role: item.role, content });
  }

  return { ok: true, value: { message, history } };
}

module.exports = { LIMITS, validateChatRequest, sanitizeText };
