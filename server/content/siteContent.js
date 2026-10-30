'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PLATFORMS, normalizeSocialUrl, renderSocialIcons, renderSocialList, escapeHtml } = require('./socialLinks');

const DEFAULT_CONTENT_FILE = path.join(__dirname, '..', '..', 'content', 'site.json');

/**
 * Loads content/site.json. It seeds the social links the first time the
 * content store is created; after that they are edited in Admin › Website content.
 * Missing or invalid values are ignored so nothing unverified is published.
 */
function loadSiteContent(filePath = DEFAULT_CONTENT_FILE, logger = console) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`[content] could not read ${path.basename(filePath)} (${err.name}); using defaults`);
  }

  const social = raw && typeof raw.social === 'object' && raw.social !== null ? raw.social : {};
  const socialLinks = [];
  for (const platform of Object.keys(PLATFORMS)) {
    const value = social[platform];
    if (value === undefined || value === null || value === '') continue;
    const url = normalizeSocialUrl(platform, value);
    if (url) socialLinks.push({ platform, url });
    else logger.warn(`[content] ignoring invalid ${platform} URL in ${path.basename(filePath)}`);
  }

  return { socialLinks };
}

function multiline(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function renderButton(button, className) {
  if (!button.label) return '';
  const external = button.href.startsWith('https://');
  let attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  // Links to a PDF on this site (e.g. the brochure) download instead of navigating away.
  if (!external && /\.pdf$/i.test(button.href.split(/[?#]/)[0])) attrs += ' download';
  const hint = external ? '<span class="mpf-visually-hidden"> (opens in a new tab)</span>' : '';
  return `<a class="btn ${className}" href="${escapeHtml(button.href)}"${attrs}>${escapeHtml(button.label)}${hint}</a>`;
}

/**
 * Banner slides (text + image), then the slide dots and the figure cards.
 * Only active slides are shown; the first is visible and site.js switches
 * the rest. `image(id)` returns { url, width, height } or null.
 */
function renderHero(content, image) {
  const slides = content.hero.slides.filter((s) => s.active);
  const total = slides.length;
  const items = slides.map((s, i) => {
    const heading = i === 0 ? 'h1' : 'h2';
    const highlight = s.highlight ? ` <span class="hero__highlight">${escapeHtml(s.highlight)}</span>` : '';
    // Banner buttons: the first is the main call to action (red), the second is blue.
    const buttons = renderButton(s.primaryButton, 'btn--cta') + renderButton(s.secondaryButton, 'btn--primary');
    const img = s.imageId ? image(s.imageId) : null;
    const media = img
      ? `<img class="hero__image hero__image--photo" src="${escapeHtml(img.url)}" alt="${escapeHtml(s.imageAlt)}" width="${img.width}" height="${img.height}"${i ? ' loading="lazy"' : ''}>`
      : '<div class="hero__image placeholder" aria-hidden="true">[Banner image — supplied by owner]</div>';
    return [
      `<div class="hero__slide" id="hero-slide-${i + 1}" role="group" aria-roledescription="slide" aria-label="Banner ${i + 1} of ${total}"${i ? ' hidden' : ''}>`,
      '<div class="hero__text">',
      s.label ? `<span class="badge">${escapeHtml(s.label)}</span>` : '',
      `<${heading} class="hero__heading">${escapeHtml(s.heading)}${highlight}</${heading}>`,
      s.text ? `<p>${multiline(s.text)}</p>` : '',
      buttons ? `<div class="btn-row">${buttons}</div>` : '',
      '</div>',
      media,
      '</div>',
    ].join('');
  });
  const dots = total > 1
    ? `<div class="hero__dots" role="group" aria-label="Choose banner">${slides
        .map((s, i) => `<button type="button" class="dot${i ? '' : ' is-active'}" data-slide="${i}" aria-controls="hero-slide-${i + 1}" aria-label="Show banner ${i + 1}"${i ? '' : ' aria-current="true"'}><span></span></button>`)
        .join('')}</div>`
    : '';
  const stats = (content.hero.stats || []).length
    ? `<ul class="hero__stats" aria-label="Key figures">${content.hero.stats
        .map((st) => `<li><strong>${escapeHtml(st.value)}</strong><span>${escapeHtml(st.label)}</span></li>`)
        .join('')}</ul>`
    : '';
  return items.join('') + dots + stats;
}

/** Programme cards: photo, name, subtitle, tagline, facts, feature points and a button. Empty values are left out. */
function renderProgrammes(programmes, image) {
  return (programmes || [])
    .map((p) => {
      const img = p.imageId ? image(p.imageId) : null;
      const media = img
        ? `<img class="programme__image programme__image--photo" src="${escapeHtml(img.url)}" alt="${escapeHtml(p.imageAlt)}" width="${img.width}" height="${img.height}" loading="lazy">`
        : '<div class="programme__image" aria-hidden="true">[Programme image]</div>';
      const facts = [['Duration', p.duration], ['Eligibility', p.eligibility]]
        .filter(([, value]) => value)
        .map(([term, value]) => `<div><dt>${term}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join('');
      const features = (p.features || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
      return [
        '<article class="programme">',
        '<header class="programme__head">',
        `<h3>${escapeHtml(p.name)}</h3>`,
        p.subtitle ? `<p class="programme__subtitle">${escapeHtml(p.subtitle)}</p>` : '',
        '</header>',
        media,
        p.tagline ? `<p class="programme__tagline">${escapeHtml(p.tagline)}</p>` : '',
        '<div class="programme__body">',
        facts ? `<dl class="programme__facts">${facts}</dl>` : '',
        features ? `<ul class="programme__features">${features}</ul>` : '',
        p.cta && p.cta.label ? renderButton(p.cta, 'programme__cta') : '',
        '</div>',
        '</article>',
      ].join('');
    })
    .join('');
}

function renderHighlights(items) {
  return (items || []).map((item) => `<div class="highlight">${escapeHtml(item)}</div>`).join('');
}

function lookup(content, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), content);
}

const PREVIEW_BANNER = '<div class="preview-banner" role="status"><strong>Preview</strong> — these changes are not published. Visitors still see the live version.</div>';

/**
 * Fills the placeholders in a public HTML page:
 * <!--SOCIAL_ICONS-->, <!--SOCIAL_LIST-->, <!--HERO-->, <!--PROGRAMMES-->, <!--HIGHLIGHTS--> and <!--TEXT:sections.x.y-->.
 * All admin-entered values are escaped.
 */
function renderPage(html, { socialLinks = [], homepage = null, image = () => null, preview = false } = {}) {
  let out = html
    .replace('<!--SOCIAL_ICONS-->', renderSocialIcons(socialLinks))
    .replace('<!--SOCIAL_LIST-->', renderSocialList(socialLinks));
  if (homepage) {
    out = out
      .replace('<!--HERO-->', renderHero(homepage, image))
      .replace('<!--PROGRAMMES-->', renderProgrammes(homepage.programmes, image))
      .replace('<!--HIGHLIGHTS-->', renderHighlights(homepage.highlights))
      .replace(/<!--TEXT:([\w.]+)-->/g, (match, key) => {
        const value = lookup(homepage, key);
        return typeof value === 'string' ? multiline(value) : '';
      });
  }
  if (preview) out = out.replace(/<body([^>]*)>/, (match) => match + PREVIEW_BANNER);
  return out;
}

module.exports = { loadSiteContent, renderPage, DEFAULT_CONTENT_FILE };
