'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeSocialUrl, renderSocialIcons, renderSocialList } = require('../../server/content/socialLinks');
const { loadSiteContent, renderPage, DEFAULT_CONTENT_FILE } = require('../../server/content/siteContent');

// Test fixtures only — not real MyPlanetFinance profiles.
const LINKEDIN = 'https://www.linkedin.com/company/example-test-page/';
const INSTAGRAM = 'https://www.instagram.com/example_test_page/';

function recordingLogger() {
  const lines = [];
  return { lines, warn: (m) => lines.push(m), error: (m) => lines.push(m) };
}

function writeContent(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpf-content-'));
  const file = path.join(dir, 'site.json');
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return file;
}

test('accepts https profile URLs on the official domains', () => {
  assert.equal(normalizeSocialUrl('linkedin', LINKEDIN), LINKEDIN);
  assert.equal(normalizeSocialUrl('linkedin', 'https://linkedin.com/in/someone'), 'https://linkedin.com/in/someone');
  assert.equal(normalizeSocialUrl('instagram', `  ${INSTAGRAM}  `), INSTAGRAM);
});

test('rejects unsafe or non-official URLs', () => {
  const bad = [
    ['linkedin', 'http://www.linkedin.com/company/x'],
    ['linkedin', 'https://linkedin.com.evil.example/company/x'],
    ['linkedin', 'https://evil.example/?u=linkedin.com'],
    ['linkedin', 'https://www.linkedin.com/'],
    ['linkedin', 'https://user:pass@www.linkedin.com/company/x'],
    ['linkedin', 'javascript:alert(1)'],
    ['instagram', 'https://www.linkedin.com/company/x'],
    ['instagram', 'instagram.com/x'],
    ['instagram', ''],
    ['instagram', 42],
    ['facebook', 'https://www.facebook.com/x'],
  ];
  for (const [platform, value] of bad) {
    assert.equal(normalizeSocialUrl(platform, value), null, `${platform}: ${value}`);
  }
});

test('renders accessible links that open safely in a new tab', () => {
  const links = [{ platform: 'linkedin', url: LINKEDIN }, { platform: 'instagram', url: INSTAGRAM }];
  const icons = renderSocialIcons(links);
  assert.match(icons, /^<nav class="topbar__social" aria-label="Social media">/);
  assert.match(icons, new RegExp(`href="${LINKEDIN}"`));
  assert.match(icons, /aria-label="MyPlanetFinance on LinkedIn \(opens in a new tab\)"/);
  assert.match(icons, /aria-label="MyPlanetFinance on Instagram \(opens in a new tab\)"/);
  assert.equal((icons.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 2);
  assert.equal((icons.match(/<svg[^>]*aria-hidden="true"/g) || []).length, 2);

  const list = renderSocialList(links);
  assert.match(list, /<span>LinkedIn<\/span>/);
  assert.match(list, /<span>Instagram<\/span>/);
});

test('renders nothing in the top bar and a neutral note in the footer when unconfigured', () => {
  assert.equal(renderSocialIcons([]), '');
  assert.equal(renderSocialList([]), '<span class="social-pending">Social media links coming soon</span>');
});

test('escapes URLs in markup', () => {
  const html = renderSocialIcons([{ platform: 'linkedin', url: 'https://www.linkedin.com/company/a"b<c' }]);
  assert.doesNotMatch(html, /a"b<c/);
  assert.match(html, /a&quot;b&lt;c/);
});

test('loadSiteContent keeps valid URLs and ignores invalid ones with a warning', () => {
  const logger = recordingLogger();
  const file = writeContent({ social: { linkedin: LINKEDIN, instagram: 'http://instagram.com/not-https' } });
  const content = loadSiteContent(file, logger);
  assert.deepEqual(content.socialLinks, [{ platform: 'linkedin', url: LINKEDIN }]);
  assert.equal(logger.lines.length, 1);
  assert.match(logger.lines[0], /ignoring invalid instagram URL/);
});

test('loadSiteContent tolerates missing, empty and malformed files', () => {
  const logger = recordingLogger();
  assert.deepEqual(loadSiteContent(path.join(os.tmpdir(), 'does-not-exist.json'), logger).socialLinks, []);
  assert.deepEqual(loadSiteContent(writeContent({ social: { linkedin: '', instagram: '' } }), logger).socialLinks, []);
  assert.deepEqual(loadSiteContent(writeContent('{not json'), logger).socialLinks, []);
  assert.equal(logger.lines.length, 1, 'only the malformed file warns');
});

test('the project content/site.json is valid and loads without warnings', () => {
  const logger = recordingLogger();
  JSON.parse(fs.readFileSync(DEFAULT_CONTENT_FILE, 'utf8'));
  loadSiteContent(DEFAULT_CONTENT_FILE, logger);
  assert.deepEqual(logger.lines, []);
});

test('renderPage replaces both placeholders', () => {
  const html = renderPage('<header><!--SOCIAL_ICONS--></header><footer><!--SOCIAL_LIST--></footer>', {
    socialLinks: [{ platform: 'instagram', url: INSTAGRAM }],
  });
  assert.doesNotMatch(html, /<!--SOCIAL_/);
  assert.match(html, /data-social="instagram"/);
});
