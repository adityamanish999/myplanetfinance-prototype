'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { create: createDom } = require('../../public/js/admin-dom');
const { createContentEditor } = require('../../public/js/admin-content');

const SEED = require('../../data/seed/site-content.json');
const IMAGE = { id: '11111111-2222-4333-8444-555555555555', type: 'image/png', size: 2048, width: 1600, height: 900, url: '/api/admin/media/11111111-2222-4333-8444-555555555555/file', inUse: true };

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

function contentState(draft = SEED, extra = {}) {
  return { draft: structuredClone(draft), published: structuredClone(SEED), hasUnpublishedChanges: false, publishedAt: null, publishedBy: null, ...extra };
}

/** Stand-in for the admin API (placeholder content only). */
function setup({ media = [IMAGE] } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  const { document } = dom.window;
  const container = document.getElementById('app');
  const calls = [];
  const messages = { say: '', warn: '' };
  let dirty = false;
  const server = { content: contentState(), media: structuredClone(media) };

  async function api(method, url, body, opts) {
    calls.push({ method, url, body, opts });
    if (method === 'GET' && url === '/api/admin/content') return { content: structuredClone(server.content), media: structuredClone(server.media) };
    if (method === 'GET' && url === '/api/admin/media') return { media: structuredClone(server.media) };
    if (method === 'PUT' && url === '/api/admin/content/draft') {
      server.content = contentState(body, { hasUnpublishedChanges: true });
      return { content: structuredClone(server.content) };
    }
    if (method === 'POST' && url === '/api/admin/content/publish') {
      server.content = contentState(server.content.draft, { published: structuredClone(server.content.draft), publishedAt: '2026-10-29T10:00:00.000Z', publishedBy: 'admin' });
      return { content: structuredClone(server.content) };
    }
    if (method === 'POST' && url === '/api/admin/media') {
      const item = { ...IMAGE, id: '99999999-2222-4333-8444-555555555555', url: '/api/admin/media/9/file', inUse: false };
      server.media.push(item);
      return { media: item };
    }
    throw new Error(`unexpected ${method} ${url}`);
  }

  const { h, field } = createDom(document);
  const editor = createContentEditor({
    document,
    window: dom.window,
    container,
    h,
    field,
    api,
    say: (m) => { messages.say = m; },
    warn: (m) => { messages.warn = m; },
    markDirty: () => { dirty = true; },
    clearDirty: () => { dirty = false; },
    isDirty: () => dirty,
  });

  function slide(index) {
    return container.querySelectorAll('fieldset.admin-slide')[index];
  }
  function inputFor(scope, labelText) {
    const label = Array.from(scope.querySelectorAll('label')).find((l) => l.firstChild && l.firstChild.textContent === labelText);
    return label.querySelector('input, textarea, select');
  }
  function type(input, value) {
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  function button(text) {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
  }
  return { dom, document, container, editor, calls, messages, server, slide, inputFor, type, button, isDirty: () => dirty };
}

test('shows banners, section text, social links and the image library', async () => {
  const ui = setup();
  await ui.editor.load();
  assert.equal(ui.container.querySelector('h1').textContent, 'Website content');
  assert.equal(ui.container.querySelectorAll('legend').length, 3 + 3 + 5 + 3, 'three banners, three figures, five sections and three programmes');
  assert.equal(ui.inputFor(ui.slide(0), 'Highlighted line (optional)').value, 'with industry-focused programmes');
  assert.equal(ui.inputFor(ui.slide(0), 'Heading').value, 'Start your finance career');
  assert.equal(ui.inputFor(ui.slide(0), 'First button text').value, 'Apply now');
  assert.equal(ui.inputFor(ui.container, 'LinkedIn URL').value, '');
  assert.match(ui.container.querySelector('.admin-status__text').textContent, /matches the live website/);
  const del = ui.container.querySelector('.admin-media__item button');
  assert.equal(del.disabled, true, 'an image in use cannot be deleted');
  assert.ok(ui.container.querySelector('.admin-media__item .admin-pill'));
});

test('edits are saved as a draft with the changed values', async () => {
  const ui = setup();
  await ui.editor.load();
  ui.type(ui.inputFor(ui.slide(0), 'Heading'), 'Admissions open');
  ui.type(ui.inputFor(ui.slide(0), 'First button text'), 'Apply now');
  ui.type(ui.inputFor(ui.container, 'Instagram URL'), 'https://www.instagram.com/example_test_page/');
  assert.equal(ui.isDirty(), true);

  ui.button('Save draft').click();
  await flush();
  const put = ui.calls.find((c) => c.method === 'PUT');
  assert.equal(put.body.hero.slides[0].heading, 'Admissions open');
  assert.equal(put.body.hero.slides[0].primaryButton.label, 'Apply now');
  assert.equal(put.body.social.instagram, 'https://www.instagram.com/example_test_page/');
  assert.equal(ui.isDirty(), false);
  assert.match(ui.messages.say, /Draft saved/);
  assert.match(ui.container.querySelector('.admin-status__text').textContent, /not live yet/);
});

test('preview is blocked until the draft is saved', async () => {
  const ui = setup();
  await ui.editor.load();
  const preview = () => ui.container.querySelector('a[href="/api/admin/content/preview"]');
  assert.equal(preview().getAttribute('target'), '_blank');
  ui.type(ui.inputFor(ui.slide(1), 'Heading'), 'Changed');
  const event = new ui.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  preview().dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.match(ui.messages.warn, /Save the draft first/);
});

test('publishing needs a confirmation click and saves pending edits first', async () => {
  const ui = setup();
  await ui.editor.load();
  ui.type(ui.inputFor(ui.slide(0), 'Heading'), 'Live heading');
  const publish = ui.button('Publish');
  publish.click();
  await flush();
  assert.equal(publish.textContent, 'Confirm publish');
  assert.equal(ui.calls.filter((c) => c.method !== 'GET').length, 0, 'nothing sent on the first click');
  publish.click();
  await flush();
  assert.deepEqual(ui.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url}`), ['PUT /api/admin/content/draft', 'POST /api/admin/content/publish']);
  assert.equal(ui.server.content.published.hero.slides[0].heading, 'Live heading');
  assert.match(ui.messages.say, /Published/);
});

test('uploads an image for a banner as raw bytes with its type', async () => {
  const ui = setup();
  await ui.editor.load();
  const input = ui.slide(0).querySelector('input[type=file]');
  const file = new ui.dom.window.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new ui.dom.window.Event('change'));
  await flush();
  const post = ui.calls.find((c) => c.method === 'POST' && c.url === '/api/admin/media');
  assert.equal(post.body, file);
  assert.deepEqual(post.opts, { contentType: 'image/png' });
  assert.equal(ui.inputFor(ui.slide(0), 'Image description (alt text)').value, '');
  assert.equal(ui.slide(0).querySelector('select').value, '99999999-2222-4333-8444-555555555555');
  assert.equal(ui.isDirty(), true);
  assert.match(ui.messages.say, /Add a description/);
});

test('rejects non-image and oversized files before uploading', async () => {
  const ui = setup();
  await ui.editor.load();
  const input = ui.container.querySelector('.admin-media ~ .admin-field input[type=file]');
  for (const file of [
    new ui.dom.window.File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
    new ui.dom.window.File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }),
  ]) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new ui.dom.window.Event('change'));
    await flush();
  }
  assert.equal(ui.calls.filter((c) => c.url === '/api/admin/media' && c.method === 'POST').length, 0);
  assert.match(ui.messages.warn, /5 MB or smaller/);
});

test('banners can be added, reordered and removed within limits', async () => {
  const ui = setup();
  await ui.editor.load();
  ui.button('Move down').click();
  assert.equal(ui.inputFor(ui.slide(1), 'Heading').value, 'Start your finance career');
  ui.button('Add banner').click();
  ui.button('Add banner').click();
  assert.equal(ui.container.querySelectorAll('fieldset.admin-slide legend').length - 3 - 5 - 3, 5);
  assert.equal(ui.button('Add banner').disabled, true, 'at most five banners');
  for (let i = 0; i < 4; i++) ui.container.querySelector('button[aria-label="Remove banner 1"]').click();
  assert.equal(ui.container.querySelector('button[aria-label="Remove banner 1"]').disabled, true, 'the last banner cannot be removed');
});

test('figures under the banners can be edited, added and removed (max 3)', async () => {
  const ui = setup();
  await ui.editor.load();
  assert.equal(ui.button('Add figure').disabled, true, 'the seed already has three');
  ui.container.querySelector('button[aria-label="Remove figure 3"]').click();
  ui.container.querySelector('button[aria-label="Remove figure 2"]').click();
  const figure = Array.from(ui.container.querySelectorAll('fieldset.admin-slide')).find((f) => f.querySelector('legend').textContent === 'Figure 1');
  ui.type(ui.inputFor(figure, 'Value'), '[Figure A]');
  ui.type(ui.inputFor(figure, 'Label'), '[Label A]');
  ui.type(ui.inputFor(ui.slide(0), 'Highlighted line (optional)'), 'and practical skills');
  ui.button('Save draft').click();
  await flush();
  const put = ui.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body.hero.stats, [{ value: '[Figure A]', label: '[Label A]' }]);
  assert.equal(put.body.hero.slides[0].highlight, 'and practical skills');
});

test('older saved content without figures still loads', async () => {
  const ui = setup();
  const old = structuredClone(SEED);
  delete old.hero.stats;
  ui.server.content = contentState(old);
  await ui.editor.load();
  assert.equal(ui.button('Add figure').disabled, false);
  assert.match(ui.container.textContent, /No figures/);
});

test('programme cards: eligibility and duration are editable and saved', async () => {
  const ui = setup();
  await ui.editor.load();
  const card = Array.from(ui.container.querySelectorAll('fieldset.admin-slide')).find((f) => f.querySelector('legend').textContent === 'Programme 2');
  assert.equal(ui.inputFor(card, 'Eligibility').value, 'PUC (Class 12)');
  ui.type(ui.inputFor(card, 'Duration'), '[Placeholder duration]');
  ui.container.querySelector('button[aria-label="Remove programme 3"]').click();
  ui.button('Save draft').click();
  await flush();
  const put = ui.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body.programmes.map((p) => [p.name, p.eligibility]), [['PGDM / MBA', 'Undergraduate degree'], ['Advanced B.Com / BBA', 'PUC (Class 12)']]);
  assert.equal(put.body.programmes[1].duration, '[Placeholder duration]');
});

test('programme card details and "why us" boxes are edited one item per line', async () => {
  const ui = setup();
  await ui.editor.load();
  const card = Array.from(ui.container.querySelectorAll('fieldset.admin-slide')).find((f) => f.querySelector('legend').textContent === 'Programme 1');
  assert.equal(ui.inputFor(card, 'Subtitle').value, 'Master of Business Administration');
  assert.equal(card.querySelector('select').getAttribute('aria-label'), 'Programme 1 image');
  ui.type(ui.inputFor(card, 'Feature points (one per line, up to 6)'), ' First point \n\nSecond point ');
  ui.type(ui.inputFor(ui.container, 'Boxes (one per line, up to 8)'), 'Box A\nBox B');
  ui.button('Save draft').click();
  await flush();
  const put = ui.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body.programmes[0].features, ['First point', 'Second point']);
  assert.deepEqual(put.body.highlights, ['Box A', 'Box B']);
  assert.equal(put.body.programmes[0].cta.href, '/apply.html');
});
