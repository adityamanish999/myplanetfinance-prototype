'use strict';

const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const COOKIE_NAME = 'mpf_admin';
const COOKIE_PATH = '/api/admin';

/** Returns "scrypt:<salt hex>:<hash hex>" for storing in ADMIN_PASSWORD_HASH. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

function safeEqual(a, b) {
  const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/**
 * Single-admin authentication for the prototype. Credentials come from the
 * environment; sessions live in memory (signing in again is needed after a
 * restart). Admin is disabled when credentials are not configured.
 */
function createAdminAuth({ username, passwordHash, sessionTtlMs, secureCookie = false, now = Date.now }) {
  const sessions = new Map();
  const enabled = Boolean(username && passwordHash);

  function cookie(value, maxAgeSeconds) {
    return [
      `${COOKIE_NAME}=${value}`,
      `Path=${COOKIE_PATH}`,
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      secureCookie ? 'Secure' : null,
    ]
      .filter(Boolean)
      .join('; ');
  }

  return {
    enabled,

    login(candidateUser, candidatePassword) {
      if (!enabled) return null;
      const userOk = safeEqual(candidateUser, username);
      const passwordOk = verifyPassword(candidatePassword, passwordHash);
      if (!userOk || !passwordOk) return null;
      for (const [token, session] of sessions) {
        if (session.expiresAt <= now()) sessions.delete(token);
      }
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { username, expiresAt: now() + sessionTtlMs });
      return token;
    },

    getSession(token) {
      if (!token) return null;
      const session = sessions.get(token);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(token);
        return null;
      }
      return { username: session.username };
    },

    logout(token) {
      if (token) sessions.delete(token);
    },

    readToken(req) {
      return readCookie(req.headers.cookie, COOKIE_NAME);
    },

    sessionCookie(token) {
      return cookie(token, Math.floor(sessionTtlMs / 1000));
    },

    clearCookie() {
      return cookie('', 0);
    },
  };
}

module.exports = { createAdminAuth, hashPassword, verifyPassword, COOKIE_NAME };
