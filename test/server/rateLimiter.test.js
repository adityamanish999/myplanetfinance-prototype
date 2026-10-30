'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../../server/chat/rateLimiter');

function fakeClock(start = 0) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; } };
}

test('allows up to max requests per window, then blocks', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: clock.now });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  const blocked = limiter.check('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs, 1000);
});

test('tracks clients independently', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: fakeClock().now });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
});

test('resets after the window expires', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: clock.now });
  limiter.check('a');
  assert.equal(limiter.check('a').allowed, false);
  clock.advance(1000);
  assert.equal(limiter.check('a').allowed, true);
});
