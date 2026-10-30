'use strict';

const path = require('node:path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data', 'runtime');

function readInt(env, name, fallback, min = 1) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid value for ${name}: expected an integer >= ${min}.`);
  }
  return value;
}

function readBool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid value for ${name}: expected "true" or "false".`);
}

/**
 * Reads server configuration from environment variables.
 * Secrets (e.g. AI_PROVIDER_API_KEY) are deliberately NOT included here;
 * a provider reads its own key when it is constructed, so the key never
 * travels through shared config objects or reaches the browser.
 * The admin password is only ever held as a scrypt hash.
 */
function loadConfig(env = process.env) {
  return {
    host: env.HOST || '127.0.0.1',
    port: readInt(env, 'PORT', 3000),
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : DEFAULT_DATA_DIR,
    admin: {
      username: env.ADMIN_USERNAME || '',
      passwordHash: env.ADMIN_PASSWORD_HASH || '',
      sessionTtlMs: readInt(env, 'ADMIN_SESSION_MINUTES', 60) * 60 * 1000,
      secureCookie: readBool(env, 'COOKIE_SECURE', false),
    },
    chat: {
      provider: env.CHAT_PROVIDER || 'mock',
      timeoutMs: readInt(env, 'CHAT_TIMEOUT_MS', 15000),
      rateLimit: {
        windowMs: readInt(env, 'CHAT_RATE_LIMIT_WINDOW_MS', 60000),
        max: readInt(env, 'CHAT_RATE_LIMIT_MAX', 10),
      },
      mock: {
        delayMs: readInt(env, 'CHAT_MOCK_DELAY_MS', 600, 0),
        simulateErrors: readBool(env, 'CHAT_MOCK_SIMULATE_ERRORS', false),
      },
    },
  };
}

module.exports = { loadConfig };
