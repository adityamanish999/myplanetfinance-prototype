'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSiteContent, mediaIdsIn, socialLinksFrom } = require('../../server/content/contentValidation');

const SEED = require('../../data/seed/site-content.json');
const IMAGE_ID = '11111111-2222-4333-8444-555555555555';

function content(mutate) {
  const value = structuredClone(SEED);
  if (mutate) mutate(value);
  return value;
}

function rejects(mutate, pattern, options) {
  assert.throws(() => validateSiteContent(content(mutate), options), pattern);
}

test('the seed content is valid and unchanged by validation', () => {
  assert.deepEqual(validateSiteContent(content()), SEED);
});

test('strips control characters, trims and collapses whitespace in single-line fields', () => {
  const clean = validateSiteContent(content((c) => {
    c.hero.slides[0].heading = '  Admissions\u0000 open\n\n now  ';
    c.hero.slides[0].text = 'Line one\n\n\n\nLine two\u0007';
  }));
  assert.equal(clean.hero.slides[0].heading, 'Admissions open now');
  assert.equal(clean.hero.slides[0].text, 'Line one\n\nLine two');
});

test('keeps HTML as plain text (it is escaped when rendered, never interpreted)', () => {
  const clean = validateSiteContent(content((c) => { c.sections.videos.heading = '<img src=x onerror=alert(1)>'; }));
  assert.equal(clean.sections.videos.heading, '<img src=x onerror=alert(1)>');
});

test('enforces required fields, types and length limits', () => {
  rejects((c) => { c.hero.slides[0].heading = '   '; }, /Banner 1 heading is required/);
  rejects((c) => { c.hero.slides[0].heading = 'x'.repeat(121); }, /120 characters or fewer/);
  rejects((c) => { c.hero.slides[0].text = 42; }, /must be text/);
  rejects((c) => { c.sections.programmes.heading = ''; }, /programmes heading is required/);
  rejects((c) => { c.sections.contact.lead = 'x'.repeat(401); }, /400 characters or fewer/);
  rejects((c) => { c.hero.slides[0].active = 'yes'; }, /choose whether the banner is shown/);
});

test('rejects unexpected fields at every level', () => {
  rejects((c) => { c.extra = 1; }, /unexpected fields/);
  rejects((c) => { c.hero.slides[0].html = '<b>x</b>'; }, /unexpected fields/);
  rejects((c) => { c.hero.slides[0].primaryButton.onclick = 'x'; }, /unexpected fields/);
  rejects((c) => { c.sections.videos.lead = 'not editable'; }, /unexpected fields/);
  rejects((c) => { c.social.twitter = 'https://x.com/a'; }, /unexpected fields/);
  rejects((c) => { delete c.sections.videos; }, /Section "videos" is invalid/);
});

test('needs 1–5 banners with at least one shown', () => {
  rejects((c) => { c.hero.slides = []; }, /at least one banner/);
  rejects((c) => { c.hero.slides = Array(6).fill(c.hero.slides[0]); }, /at most 5 banners/);
  rejects((c) => { c.hero.slides.forEach((s) => { s.active = false; }); }, /At least one banner must be shown/);
});

test('accepts only safe button links', () => {
  for (const href of ['#programmes', '/mock-tests.html', '/mock-tests/ap-icet.html?x=1#top', 'https://example.com/page']) {
    const clean = validateSiteContent(content((c) => { c.hero.slides[0].primaryButton.href = href; }));
    assert.equal(clean.hero.slides[0].primaryButton.href, href);
  }
  for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'http://example.com', '//evil.example', '/\\evil.example', 'mock-tests.html', 'https://user:pw@example.com/', '#1bad', '']) {
    rejects((c) => { c.hero.slides[0].primaryButton.href = href; }, /link/, undefined);
  }
});

test('a button without text is hidden and its link dropped', () => {
  const clean = validateSiteContent(content((c) => { c.hero.slides[0].secondaryButton = { label: '  ', href: 'javascript:alert(1)' }; }));
  assert.deepEqual(clean.hero.slides[0].secondaryButton, { label: '', href: '' });
});

test('images must exist in the library and need alt text', () => {
  const exists = { mediaExists: (id) => id === IMAGE_ID };
  rejects((c) => { c.hero.slides[0].imageId = IMAGE_ID; }, /image no longer exists/);
  rejects((c) => { c.hero.slides[0].imageId = '../../etc/passwd'; }, /image no longer exists/, exists);
  rejects((c) => { c.hero.slides[0].imageId = IMAGE_ID; c.hero.slides[0].imageAlt = ' '; }, /alt text\) is required/, exists);
  const clean = validateSiteContent(content((c) => { c.hero.slides[0].imageId = IMAGE_ID; c.hero.slides[0].imageAlt = 'Students in a classroom'; }), exists);
  assert.equal(clean.hero.slides[0].imageAlt, 'Students in a classroom');
  assert.deepEqual(mediaIdsIn(clean), [IMAGE_ID]);
  const noImage = validateSiteContent(content((c) => { c.hero.slides[0].imageAlt = 'left over'; }));
  assert.equal(noImage.hero.slides[0].imageAlt, '', 'alt text is cleared when no image is set');
});

test('social links must be official https profile URLs or empty', () => {
  // Test fixtures only — not real MyPlanetFinance profiles.
  const clean = validateSiteContent(content((c) => { c.social.linkedin = ' https://www.linkedin.com/company/example-test-page/ '; }));
  assert.equal(clean.social.linkedin, 'https://www.linkedin.com/company/example-test-page/');
  assert.deepEqual(socialLinksFrom(clean), [{ platform: 'linkedin', url: 'https://www.linkedin.com/company/example-test-page/' }]);
  rejects((c) => { c.social.instagram = 'https://evil.example/instagram'; }, /Instagram URL must be/);
  rejects((c) => { c.social.linkedin = 'http://www.linkedin.com/company/x'; }, /LinkedIn URL must be/);
  rejects((c) => { c.social.linkedin = 'https://www.linkedin.com/'; }, /LinkedIn URL must be/);
});

test('banner highlight line and figures are optional, limited and plain text', () => {
  const clean = validateSiteContent(content((c) => {
    c.hero.slides[1].highlight = '  for <b>ICET</b>\n ';
    c.hero.stats = [{ value: ' [Figure] ', label: '[Label]' }];
  }));
  assert.equal(clean.hero.slides[1].highlight, 'for <b>ICET</b>');
  assert.deepEqual(clean.hero.stats, [{ value: '[Figure]', label: '[Label]' }]);

  const old = validateSiteContent(content((c) => { delete c.hero.stats; delete c.hero.slides[0].highlight; }));
  assert.deepEqual(old.hero.stats, [], 'content saved before figures existed still loads');
  assert.equal(old.hero.slides[0].highlight, '');

  rejects((c) => { c.hero.slides[0].highlight = 'x'.repeat(61); }, /highlighted line must be 60/);
  rejects((c) => { c.hero.stats = Array(4).fill({ value: '1', label: 'x' }); }, /at most 3 figures/);
  rejects((c) => { c.hero.stats = [{ value: '', label: 'x' }]; }, /Figure 1 value is required/);
  rejects((c) => { c.hero.stats = [{ value: '1', label: 'x', icon: 'y' }]; }, /unexpected fields/);
  rejects((c) => { c.hero.stats = 'lots'; }, /figures are invalid/);
});

test('programme cards are optional, limited and plain text', () => {
  const clean = validateSiteContent(content((c) => { c.programmes[0].eligibility = '  Undergraduate\n degree '; c.programmes[0].duration = ''; }));
  assert.equal(clean.programmes[0].eligibility, 'Undergraduate degree');
  assert.equal(clean.programmes[0].duration, '');
  const minimal = validateSiteContent(content((c) => { c.programmes = [{ name: 'Only a name' }]; }));
  assert.deepEqual(minimal.programmes[0], { name: 'Only a name', subtitle: '', tagline: '', imageId: null, imageAlt: '', duration: '', eligibility: '', features: [], cta: { label: '', href: '' } }, 'cards saved before the extra fields existed still load');
  assert.deepEqual(validateSiteContent(content((c) => { delete c.programmes; })).programmes, [], 'older content without cards still loads');
  rejects((c) => { c.programmes[0].name = ''; }, /Programme 1 name is required/);
  rejects((c) => { c.programmes = Array(7).fill(c.programmes[0]); }, /at most 6 programmes/);
  rejects((c) => { c.programmes[0].fee = 'x'; }, /unexpected fields/);
});

test('programme features, card buttons, images and "why us" boxes are validated', () => {
  rejects((c) => { c.programmes[0].features = Array(7).fill('Point'); }, /at most 6 feature points/);
  rejects((c) => { c.programmes[0].features = ['ok', '  ']; }, /Programme 1 point 2 is required/);
  rejects((c) => { c.programmes[0].cta = { label: 'Apply', href: 'javascript:alert(1)' }; }, /Programme 1 button link must start with/);
  rejects((c) => { c.programmes[0].imageId = IMAGE_ID; }, /Programme 1: the selected image no longer exists/);
  rejects((c) => { c.programmes[0].imageId = IMAGE_ID; }, /Programme 1 image description/, { mediaExists: () => true });
  const withImage = validateSiteContent(content((c) => { Object.assign(c.programmes[1], { imageId: IMAGE_ID, imageAlt: 'Student on campus' }); }), { mediaExists: () => true });
  assert.deepEqual(mediaIdsIn(withImage), [IMAGE_ID], 'programme images count as in use');
  assert.deepEqual(validateSiteContent(content((c) => { delete c.highlights; })).highlights, []);
  rejects((c) => { c.highlights = Array(9).fill('Box'); }, /at most 8/);
  rejects((c) => { c.highlights = ['x'.repeat(61)]; }, /60 characters or fewer/);
});
