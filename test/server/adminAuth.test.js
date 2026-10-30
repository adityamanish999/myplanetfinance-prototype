'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminAuth, hashPassword, verifyPassword } = require('../../server/admin/adminAuth');

const PASSWORD = 'correct horse battery staple';
const HASH = hashPassword(PASSWORD);

test('hashes passwords with a random salt and verifies them', () => {
  assert.match(HASH, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.notEqual(hashPassword(PASSWORD), HASH);
  assert.equal(verifyPassword(PASSWORD, HASH), true);
  assert.equal(verifyPassword('wrong password', HASH), false);
  assert.equal(verifyPassword(PASSWORD, 'not-a-hash'), false);
  assert.equal(verifyPassword(PASSWORD, ''), false);
});

test('admin is disabled without credentials', () => {
  const auth = createAdminAuth({ username: '', passwordHash: '', sessionTtlMs: 1000 });
  assert.equal(auth.enabled, false);
  assert.equal(auth.login('', ''), null);
});

test('signs in, keeps a session until it expires, and signs out', () => {
  let time = 0;
  const auth = createAdminAuth({ username: 'admin', passwordHash: HASH, sessionTtlMs: 1000, now: () => time });
  assert.equal(auth.login('admin', 'nope'), null);
  assert.equal(auth.login('someone', PASSWORD), null);

  const token = auth.login('admin', PASSWORD);
  assert.ok(token && token.length >= 40);
  assert.deepEqual(auth.getSession(token), { username: 'admin' });

  time = 999;
  assert.ok(auth.getSession(token));
  time = 1000;
  assert.equal(auth.getSession(token), null);

  const second = auth.login('admin', PASSWORD);
  auth.logout(second);
  assert.equal(auth.getSession(second), null);
  assert.equal(auth.getSession('made-up-token'), null);
});

test('session cookie is HttpOnly, SameSite=Strict and scoped to the admin API', () => {
  const auth = createAdminAuth({ username: 'admin', passwordHash: HASH, sessionTtlMs: 60000 });
  const cookie = auth.sessionCookie('abc');
  assert.match(cookie, /^mpf_admin=abc; Path=\/api\/admin; HttpOnly; SameSite=Strict; Max-Age=60$/);
  assert.match(createAdminAuth({ username: 'a', passwordHash: HASH, sessionTtlMs: 60000, secureCookie: true }).sessionCookie('x'), /; Secure$/);
  assert.match(auth.clearCookie(), /Max-Age=0/);
  assert.equal(auth.readToken({ headers: { cookie: 'other=1; mpf_admin=tok123; x=y' } }), 'tok123');
  assert.equal(auth.readToken({ headers: {} }), null);
});
