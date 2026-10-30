'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../server/app');
const { createChatService } = require('../../server/chat/chatService');
const { createRateLimiter } = require('../../server/chat/rateLimiter');
const { createMockProvider } = require('../../server/chat/providers/mockProvider');
const { createJsonStore } = require('../../server/storage/jsonStore');
const { createTestRepository } = require('../../server/mockTests/testRepository');
const { createAdminAuth, hashPassword } = require('../../server/admin/adminAuth');
const { createContentRepository, initialContent } = require('../../server/content/contentRepository');
const { createMediaLibrary } = require('../../server/content/mediaLibrary');
const { tempDir } = require('./helpers/mockTestFixtures');
const { png, jpeg } = require('./helpers/imageFixtures');

const silentLogger = { info() {}, warn() {}, error() {} };
const PASSWORD = 'test-only-password-123';
const PASSWORD_HASH = hashPassword(PASSWORD);
const SEED = require('../../data/seed/site-content.json');
const MAX_UPLOAD = 4096;
// Test fixtures only — not real MyPlanetFinance profiles.
const LINKEDIN = 'https://www.linkedin.com/company/example-test-page/';

async function startServer({ dir = tempDir(), adminEnabled = true, sessionTtlMs = 60000, now } = {}) {
  const media = createMediaLibrary({
    store: createJsonStore(path.join(dir, 'media.json'), { initial: { version: 1, items: [] } }),
    dir: path.join(dir, 'uploads'),
    maxBytes: MAX_UPLOAD,
  });
  const repository = createContentRepository(createJsonStore(path.join(dir, 'site-content.json'), { initial: () => initialContent(SEED) }), { mediaExists: media.exists });
  const authOptions = adminEnabled ? { username: 'admin', passwordHash: PASSWORD_HASH, sessionTtlMs, now } : { sessionTtlMs };
  const app = createApp({
    chatService: createChatService({ provider: createMockProvider(), timeoutMs: 1000, logger: silentLogger }),
    rateLimiter: createRateLimiter({ windowMs: 60000, max: 50 }),
    content: { repository, media },
    admin: {
      auth: createAdminAuth(authOptions),
      repository: createTestRepository(createJsonStore(path.join(dir, 'mock-tests.json'), { initial: { version: 1, tests: [] } })),
      loginLimiter: createRateLimiter({ windowMs: 60000, max: 50 }),
    },
    logger: silentLogger,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { body, raw, type, cookie, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (raw !== undefined) {
      payload = raw;
      if (type) h['Content-Type'] = type;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    const res = await fetch(baseUrl + url, { method, headers: h, body: payload });
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString('utf8');
    let json = null;
    if ((res.headers.get('content-type') || '').includes('json')) json = JSON.parse(text);
    return { status: res.status, headers: res.headers, body: json, text, buffer };
  }

  async function login() {
    const res = await call('POST', '/api/admin/login', { body: { username: 'admin', password: PASSWORD } });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  }

  async function draft(cookie) {
    return (await call('GET', '/api/admin/content', { cookie })).body.content.draft;
  }

  return { dir, baseUrl, call, login, draft, close: () => new Promise((r) => server.close(r)) };
}

const ID = '11111111-2222-4333-8444-555555555555';
const PROTECTED = [
  ['GET', '/api/admin/content'],
  ['PUT', '/api/admin/content/draft', { body: SEED }],
  ['POST', '/api/admin/content/publish', { body: {} }],
  ['POST', '/api/admin/content/discard', { body: {} }],
  ['GET', '/api/admin/content/preview'],
  ['GET', '/api/admin/media'],
  ['POST', '/api/admin/media', { raw: png(), type: 'image/png' }],
  ['GET', `/api/admin/media/${ID}/file`],
  ['DELETE', `/api/admin/media/${ID}`],
];

test('every content and media admin route requires a signed-in admin', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  for (const cookie of [undefined, 'mpf_admin=made-up-token', 'other=1']) {
    for (const [method, url, options] of PROTECTED) {
      const res = await srv.call(method, url, { ...options, cookie });
      assert.equal(res.status, 401, `${method} ${url} with ${cookie}`);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
      assert.doesNotMatch(res.text, /Start your finance career/, 'no content leaks in the error');
    }
  }
  assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'uploads')), [], 'no file was stored');
});

test('content routes are unavailable when admin is not configured', async (t) => {
  const srv = await startServer({ adminEnabled: false });
  t.after(srv.close);
  for (const [method, url, options] of PROTECTED) {
    assert.equal((await srv.call(method, url, options)).status, 503, `${method} ${url}`);
  }
});

test('sessions stop working after sign-out and after they expire', async (t) => {
  let time = Date.UTC(2026, 9, 29, 10, 0, 0);
  const srv = await startServer({ sessionTtlMs: 60000, now: () => time });
  t.after(srv.close);
  const cookie = await srv.login();
  assert.equal((await srv.call('GET', '/api/admin/content', { cookie })).status, 200);
  time += 60000;
  assert.equal((await srv.call('GET', '/api/admin/content', { cookie })).status, 401, 'expired');

  const second = await srv.login();
  await srv.call('POST', '/api/admin/logout', { cookie: second, body: {} });
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie: second, body: SEED })).status, 401, 'signed out');
});

test('blocks cross-site and non-JSON writes even with a valid session', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const crossSite = { cookie, headers: { Origin: 'https://evil.example' } };
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { ...crossSite, body: SEED })).status, 403);
  assert.equal((await srv.call('POST', '/api/admin/content/publish', { ...crossSite, body: {} })).status, 403);
  assert.equal((await srv.call('POST', '/api/admin/media', { ...crossSite, raw: png(), type: 'image/png' })).status, 403);
  // A cross-site HTML form can only send these content types.
  for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
    assert.equal((await srv.call('POST', '/api/admin/content/publish', { cookie, raw: 'a=1', type })).status, 415, type);
    assert.equal((await srv.call('POST', '/api/admin/media', { cookie, raw: 'a=1', type })).status, 415, type);
  }
});

test('validates and sanitises content on save', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const content = await srv.draft(cookie);

  content.hero.slides[0].primaryButton.href = 'javascript:alert(1)';
  let res = await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /first button link must start with/);

  content.hero.slides[0].primaryButton.href = '#programmes';
  content.social.instagram = 'https://instagram.evil.example/profile';
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content })).status, 400);

  content.social.instagram = '';
  content.hero.slides[0].heading = '  Admissions\u0000 open  ';
  res = await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.draft.hero.slides[0].heading, 'Admissions open');

  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie, raw: '{bad json', type: 'application/json' })).status, 400);
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie, raw: JSON.stringify({ ...content, pad: 'x'.repeat(70000) }), type: 'application/json' })).status, 413);
});

test('validates uploads by content, type and size', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const upload = (raw, type) => srv.call('POST', '/api/admin/media', { cookie, raw, type });

  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status, 415);
  assert.equal((await upload(png(), 'application/octet-stream')).status, 415);
  assert.equal((await upload(png(), 'text/html')).status, 415);
  let res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'image/png');
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /not a valid JPEG, PNG or WebP/);
  assert.equal((await upload(jpeg(), 'image/png')).status, 400, 'declared type must match the contents');
  res = await upload(Buffer.concat([png(), Buffer.alloc(MAX_UPLOAD)]), 'image/png');
  assert.equal(res.status, 413);
  assert.match(res.body.error.message, /MB or smaller/);
  assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'uploads')), []);

  res = await upload(png(4, 2), 'image/png');
  assert.equal(res.status, 201);
  assert.deepEqual([res.body.media.type, res.body.media.width, res.body.media.height, res.body.media.uploadedBy], ['image/png', 4, 2, 'admin']);
  assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'uploads')), [`${res.body.media.id}.png`]);
});

test('visitors only see published content; admins preview the draft first', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const image = (await srv.call('POST', '/api/admin/media', { cookie, raw: png(4, 2), type: 'image/png' })).body.media;

  const content = await srv.draft(cookie);
  Object.assign(content.hero.slides[0], { heading: 'New <script>alert(1)</script> heading', imageId: image.id, imageAlt: 'Students "at" campus', label: 'Admissions' });
  content.hero.slides[0].primaryButton = { label: 'Apply now', href: '#contact' };
  content.hero.slides[2].active = false;
  content.sections.videos.heading = 'Student stories';
  content.social.linkedin = LINKEDIN;
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content })).status, 200);

  // Before publishing: the live site and public image URL are unchanged.
  let home = (await srv.call('GET', '/')).text;
  assert.match(home, /Start your finance career <span class="hero__highlight">/);
  assert.doesNotMatch(home, /Student stories|data-social=/);
  assert.equal((await srv.call('GET', `/media/${image.id}`)).status, 404);

  // Preview shows the draft, escaped, with the admin-only image URL.
  const preview = await srv.call('GET', '/api/admin/content/preview', { cookie });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /text\/html/);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal(preview.headers.get('x-frame-options'), 'DENY');
  assert.match(preview.text, /class="preview-banner"/);
  assert.match(preview.text, /New &lt;script&gt;alert\(1\)&lt;\/script&gt; heading/);
  assert.doesNotMatch(preview.text, /<script>alert/);
  assert.match(preview.text, new RegExp(`src="/api/admin/media/${image.id}/file" alt="Students &quot;at&quot; campus"`));
  assert.match(preview.text, /Student stories/);

  // Publish: the live site now shows the changes.
  const published = await srv.call('POST', '/api/admin/content/publish', { cookie, body: {} });
  assert.equal(published.status, 200);
  assert.equal(published.body.content.hasUnpublishedChanges, false);
  home = (await srv.call('GET', '/')).text;
  assert.doesNotMatch(home, /preview-banner|<!--HERO-->|<!--TEXT:/);
  assert.match(home, /<h1 class="hero__heading">New &lt;script&gt;alert\(1\)&lt;\/script&gt; heading <span class="hero__highlight">with industry-focused programmes<\/span><\/h1>/);
  assert.match(home, /<aside id="enquiry" class="hero__form"/, 'enquiry form sits in the hero');
  assert.match(home, /<span class="badge">Admissions<\/span>/);
  assert.match(home, /<a class="btn btn--cta" href="#contact">Apply now<\/a>/);
  assert.match(home, new RegExp(`<img class="hero__image hero__image--photo" src="/media/${image.id}" alt="Students &quot;at&quot; campus" width="4" height="2">`));
  assert.match(home, /<h2>Student stories<\/h2>/);
  assert.match(home, /Not affiliated with the official exam authorities/, 'mock-test disclaimer is fixed');
  assert.equal((home.match(/class="hero__slide"/g) || []).length, 2, 'inactive banner is not shown');
  assert.equal((home.match(/data-social="linkedin"/g) || []).length, 2);
  assert.match((await srv.call('GET', '/mock-tests.html')).text, /data-social="linkedin"/);

  const file = await srv.call('GET', `/media/${image.id}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(file.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.deepEqual(file.buffer, png(4, 2));
});

test('images used by a banner cannot be deleted; unused ones can', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const used = (await srv.call('POST', '/api/admin/media', { cookie, raw: png(), type: 'image/png' })).body.media;
  const spare = (await srv.call('POST', '/api/admin/media', { cookie, raw: jpeg(), type: 'image/jpeg' })).body.media;
  const content = await srv.draft(cookie);
  Object.assign(content.hero.slides[1], { imageId: used.id, imageAlt: 'Campus' });
  await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content });

  const list = (await srv.call('GET', '/api/admin/media', { cookie })).body.media;
  assert.deepEqual(list.map((m) => [m.id, m.inUse]), [[used.id, true], [spare.id, false]]);
  assert.equal((await srv.call('DELETE', `/api/admin/media/${used.id}`, { cookie })).status, 409);
  assert.equal((await srv.call('DELETE', `/api/admin/media/${spare.id}`, { cookie })).status, 200);
  assert.equal((await srv.call('GET', `/api/admin/media/${spare.id}/file`, { cookie })).status, 404);
  assert.equal((await srv.call('GET', '/media/not-an-id')).status, 404);
  assert.equal((await srv.call('GET', '/media/..%2Fmedia.json')).status, 404);
});

test('discarding the draft restores the published content', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const content = await srv.draft(cookie);
  content.sections.programmes.heading = 'Unwanted change';
  await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content });
  const res = await srv.call('POST', '/api/admin/content/discard', { cookie, body: {} });
  assert.equal(res.body.content.draft.sections.programmes.heading, 'Study programmes');
  assert.equal(res.body.content.hasUnpublishedChanges, false);
});

test('published content, drafts and images survive a server restart', async (t) => {
  const first = await startServer();
  let cookie = await first.login();
  const image = (await first.call('POST', '/api/admin/media', { cookie, raw: png(), type: 'image/png' })).body.media;
  const content = await first.draft(cookie);
  Object.assign(content.hero.slides[0], { heading: 'Persisted heading', imageId: image.id, imageAlt: 'Campus' });
  await first.call('PUT', '/api/admin/content/draft', { cookie, body: content });
  await first.call('POST', '/api/admin/content/publish', { cookie, body: {} });
  content.sections.videos.heading = 'Unpublished draft';
  await first.call('PUT', '/api/admin/content/draft', { cookie, body: content });
  await first.close();

  const second = await startServer({ dir: first.dir });
  t.after(second.close);
  assert.match((await second.call('GET', '/')).text, /Persisted heading/);
  assert.equal((await second.call('GET', `/media/${image.id}`)).status, 200);
  cookie = await second.login();
  const state = (await second.call('GET', '/api/admin/content', { cookie })).body.content;
  assert.equal(state.draft.sections.videos.heading, 'Unpublished draft');
  assert.equal(state.hasUnpublishedChanges, true);
});

test('banner buttons, figures, application page and brochure are served', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const home = (await srv.call('GET', '/')).text;
  assert.match(home, /<a class="btn btn--cta" href="\/apply.html">Apply now<\/a><a class="btn btn--primary" href="\/brochure.pdf" download>Download brochure<\/a>/);
  assert.match(home, /<li><strong>100%<\/strong><span>Case-based teaching<\/span><\/li><li><strong>95%<\/strong><span>Placements<\/span><\/li><li><strong>25,000<\/strong><span>Alumni strength<\/span><\/li>/);

  assert.doesNotMatch(home, /<!--PROGRAMMES-->/);
  assert.match(home, /<h3>PGDM \/ MBA<\/h3><p class="programme__subtitle">Master of Business Administration<\/p>/);
  assert.match(home, /<p class="programme__tagline">Lead · Manage · Grow<\/p>/);
  assert.match(home, /<dl class="programme__facts"><div><dt>Duration<\/dt><dd>\[To confirm\]<\/dd><\/div><div><dt>Eligibility<\/dt><dd>Undergraduate degree<\/dd><\/div><\/dl>/);
  assert.match(home, /<li>Case studies &amp; real-world applications<\/li>/);
  assert.match(home, /<a class="btn programme__cta" href="\/apply.html">Prepare for a successful MBA journey<\/a>/);
  assert.match(home, /<h3>Advanced B.Com \/ BBA<\/h3>.*?<dd>PUC \(Class 12\)<\/dd>/);
  assert.match(home, /<h3>Investment Banking &amp; Fund Accounting<\/h3>.*?<dt>Eligibility<\/dt><dd>MBA<\/dd>/);
  assert.equal((home.match(/<div class="highlight">/g) || []).length, 6);
  assert.match(home, /<div class="highlight">Online &amp; offline learning options<\/div>/);

  const apply = await srv.call('GET', '/apply.html');
  assert.equal(apply.status, 200);
  assert.doesNotMatch(apply.text, /<!--SOCIAL_/);
  assert.match(apply.text, /<form id="apply-form"/);

  const pdf = await srv.call('GET', '/brochure.pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
});

test('programme card images are private until a published card uses them', async (t) => {
  const srv = await startServer();
  t.after(srv.close);
  const cookie = await srv.login();
  const image = (await srv.call('POST', '/api/admin/media', { cookie, raw: png(6, 3), type: 'image/png' })).body.media;
  const content = await srv.draft(cookie);
  Object.assign(content.programmes[0], { imageId: image.id, imageAlt: 'Placeholder programme photo' });
  assert.equal((await srv.call('PUT', '/api/admin/content/draft', { cookie, body: content })).status, 200);
  assert.equal((await srv.call('GET', `/media/${image.id}`)).status, 404);
  assert.equal((await srv.call('DELETE', `/api/admin/media/${image.id}`, { cookie })).status, 409, 'in use by a draft card');
  await srv.call('POST', '/api/admin/content/publish', { cookie, body: {} });
  assert.equal((await srv.call('GET', `/media/${image.id}`)).status, 200);
  assert.match((await srv.call('GET', '/')).text, new RegExp(`<img class="programme__image programme__image--photo" src="/media/${image.id}" alt="Placeholder programme photo" width="6" height="3" loading="lazy">`));
});
