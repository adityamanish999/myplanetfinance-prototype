'use strict';

const PRUNE_THRESHOLD = 10000;

/**
 * Fixed-window, in-memory rate limiter keyed by client identifier (IP).
 * Suitable for a single-process prototype only; replace with a shared store
 * (e.g. Redis) before running more than one server instance.
 */
function createRateLimiter({ windowMs, max, now = Date.now }) {
  const windows = new Map();

  function prune(time) {
    for (const [key, entry] of windows) {
      if (time >= entry.resetAt) windows.delete(key);
    }
  }

  function check(key) {
    const time = now();
    let entry = windows.get(key);
    if (!entry || time >= entry.resetAt) {
      entry = { count: 0, resetAt: time + windowMs };
      windows.set(key, entry);
      if (windows.size > PRUNE_THRESHOLD) prune(time);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfterMs: entry.resetAt - time,
    };
  }

  return { check, reset: () => windows.clear() };
}

module.exports = { createRateLimiter };
