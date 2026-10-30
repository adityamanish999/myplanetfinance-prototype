'use strict';

const { sanitizeText } = require('../chat/validation');
const { PLATFORMS, normalizeSocialUrl } = require('./socialLinks');

const LIMITS = Object.freeze({
  minSlides: 1,
  maxSlides: 5,
  labelMax: 40,
  headingMax: 120,
  highlightMax: 60,
  maxStats: 3,
  statValueMax: 20,
  statLabelMax: 40,
  slideTextMax: 300,
  altMax: 150,
  buttonLabelMax: 60,
  hrefMax: 300,
  sectionHeadingMax: 80,
  maxProgrammes: 6,
  programmeNameMax: 80,
  programmeDetailMax: 120,
  maxFeatures: 6,
  featureMax: 80,
  maxHighlights: 8,
  highlightItemMax: 60,
  leadMax: 400,
});

// Editable homepage sections and the fields each one has.
const SECTIONS = Object.freeze({
  programmes: ['heading', 'lead'],
  mockTests: ['heading', 'lead'],
  highlights: ['heading'],
  videos: ['heading'],
  contact: ['heading', 'lead'],
});

const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ANCHOR = /^#[A-Za-z][\w-]*$/;
const SITE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~/?=&#%+]*$/;

class ValidationError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkFields(value, allowed, label) {
  if (!isPlainObject(value)) throw new ValidationError(`${label} is invalid.`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new ValidationError(`${label} contains unexpected fields.`);
}

/**
 * Plain text only: control characters are removed and the value is trimmed.
 * Single-line fields also collapse whitespace. HTML is never interpreted;
 * it is escaped when the page is rendered.
 */
function text(value, label, { max, required = false, multiline = false }) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text.`);
  let clean = sanitizeText(value);
  clean = multiline ? clean.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : clean.replace(/\s+/g, ' ');
  if (required && !clean) throw new ValidationError(`${label} is required.`);
  if (clean.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return clean;
}

/** Button links may point to a section (#programmes), a page on this site (/mock-tests.html) or an https URL. */
function href(value, label) {
  const clean = text(value, label, { max: LIMITS.hrefMax, required: true });
  if (ANCHOR.test(clean) || SITE_PATH.test(clean)) return clean;
  let url;
  try {
    url = new URL(clean);
  } catch {
    url = null;
  }
  if (url && url.protocol === 'https:' && !url.username && !url.password) return url.href;
  throw new ValidationError(`${label} must start with "#", "/" or "https://".`);
}

function button(value, label) {
  checkFields(value, ['label', 'href'], label);
  const buttonLabel = text(value.label, `${label} text`, { max: LIMITS.buttonLabelMax });
  // A button without text is hidden, so its link is not needed.
  if (!buttonLabel) return { label: '', href: '' };
  return { label: buttonLabel, href: href(value.href, `${label} link`) };
}

/** An optional uploaded image and its alt text (required when an image is set). */
function image(value, label, mediaExists) {
  let imageId = null;
  if (value.imageId !== undefined && value.imageId !== null && value.imageId !== '') {
    if (typeof value.imageId !== 'string' || !MEDIA_ID.test(value.imageId) || !mediaExists(value.imageId)) {
      throw new ValidationError(`${label}: the selected image no longer exists. Choose another image.`);
    }
    imageId = value.imageId;
  }
  const imageAlt = text(value.imageAlt, `${label} image description (alt text)`, { max: LIMITS.altMax, required: Boolean(imageId) });
  return { imageId, imageAlt: imageId ? imageAlt : '' };
}

function slide(value, index, mediaExists) {
  const label = `Banner ${index + 1}`;
  checkFields(value, ['label', 'heading', 'highlight', 'text', 'imageId', 'imageAlt', 'primaryButton', 'secondaryButton', 'active'], label);
  const { imageId, imageAlt } = image(value, label, mediaExists);
  if (typeof value.active !== 'boolean') throw new ValidationError(`${label}: choose whether the banner is shown.`);
  return {
    label: text(value.label, `${label} label`, { max: LIMITS.labelMax }),
    heading: text(value.heading, `${label} heading`, { max: LIMITS.headingMax, required: true }),
    highlight: text(value.highlight, `${label} highlighted line`, { max: LIMITS.highlightMax }),
    text: text(value.text, `${label} text`, { max: LIMITS.slideTextMax, multiline: true }),
    imageId,
    imageAlt,
    primaryButton: button(value.primaryButton, `${label} first button`),
    secondaryButton: button(value.secondaryButton, `${label} second button`),
    active: value.active,
  };
}

/** Figures shown under the banners. Optional; values must come from the owner (never invented). */
function stats(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError('Banner figures are invalid.');
  if (value.length > LIMITS.maxStats) throw new ValidationError(`You can show at most ${LIMITS.maxStats} figures.`);
  return value.map((stat, i) => {
    checkFields(stat, ['value', 'label'], `Figure ${i + 1}`);
    return {
      value: text(stat.value, `Figure ${i + 1} value`, { max: LIMITS.statValueMax, required: true }),
      label: text(stat.label, `Figure ${i + 1} label`, { max: LIMITS.statLabelMax, required: true }),
    };
  });
}

function sections(value) {
  checkFields(value, Object.keys(SECTIONS), 'Sections');
  const result = {};
  for (const [key, fields] of Object.entries(SECTIONS)) {
    const section = value[key];
    checkFields(section, fields, `Section "${key}"`);
    result[key] = { heading: text(section.heading, `${key} heading`, { max: LIMITS.sectionHeadingMax, required: true }) };
    if (fields.includes('lead')) result[key].lead = text(section.lead, `${key} introduction`, { max: LIMITS.leadMax, multiline: true });
  }
  return result;
}

const PROGRAMME_FIELDS = ['name', 'subtitle', 'tagline', 'imageId', 'imageAlt', 'duration', 'eligibility', 'features', 'cta'];

/**
 * Programme cards. Fields other than the name are optional (and may be missing
 * in content saved before they existed); empty values are hidden on the page.
 */
function programmes(value, mediaExists) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError('Programmes are invalid.');
  if (value.length > LIMITS.maxProgrammes) throw new ValidationError(`You can show at most ${LIMITS.maxProgrammes} programmes.`);
  return value.map((p, i) => {
    const label = `Programme ${i + 1}`;
    checkFields(p, PROGRAMME_FIELDS, label);
    const features = p.features === undefined ? [] : p.features;
    if (!Array.isArray(features) || features.length > LIMITS.maxFeatures) throw new ValidationError(`${label}: add at most ${LIMITS.maxFeatures} feature points.`);
    return {
      name: text(p.name, `${label} name`, { max: LIMITS.programmeNameMax, required: true }),
      subtitle: text(p.subtitle, `${label} subtitle`, { max: LIMITS.programmeDetailMax }),
      tagline: text(p.tagline, `${label} tagline`, { max: LIMITS.programmeDetailMax }),
      ...image(p, label, mediaExists),
      duration: text(p.duration, `${label} duration`, { max: LIMITS.programmeDetailMax }),
      eligibility: text(p.eligibility, `${label} eligibility`, { max: LIMITS.programmeDetailMax }),
      features: features.map((f, j) => text(f, `${label} point ${j + 1}`, { max: LIMITS.featureMax, required: true })),
      cta: p.cta === undefined ? { label: '', href: '' } : button(p.cta, `${label} button`),
    };
  });
}

/** "Why study with us" boxes: short plain-text items. */
function highlights(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.maxHighlights) throw new ValidationError(`Add at most ${LIMITS.maxHighlights} "Why study with us" items.`);
  return value.map((item, i) => text(item, `"Why study with us" item ${i + 1}`, { max: LIMITS.highlightItemMax, required: true }));
}

function social(value) {
  checkFields(value, Object.keys(PLATFORMS), 'Social links');
  const result = {};
  for (const [platform, spec] of Object.entries(PLATFORMS)) {
    const raw = text(value[platform], `${spec.name} URL`, { max: LIMITS.hrefMax });
    if (!raw) {
      result[platform] = '';
      continue;
    }
    const url = normalizeSocialUrl(platform, raw);
    if (!url) throw new ValidationError(`${spec.name} URL must be an https:// profile link on ${spec.hosts[0]}.`);
    result[platform] = url;
  }
  return result;
}

/**
 * Validates the full editable site content. `mediaExists(id)` reports whether
 * an uploaded image exists. Returns a clean copy or throws ValidationError.
 */
function validateSiteContent(body, { mediaExists = () => false } = {}) {
  checkFields(body, ['hero', 'sections', 'programmes', 'highlights', 'social'], 'Content');
  checkFields(body.hero, ['slides', 'stats'], 'Banners');
  const { slides } = body.hero;
  if (!Array.isArray(slides) || slides.length < LIMITS.minSlides) throw new ValidationError('Add at least one banner.');
  if (slides.length > LIMITS.maxSlides) throw new ValidationError(`You can have at most ${LIMITS.maxSlides} banners.`);
  const cleanSlides = slides.map((s, i) => slide(s, i, mediaExists));
  if (!cleanSlides.some((s) => s.active)) throw new ValidationError('At least one banner must be shown.');
  return {
    hero: { slides: cleanSlides, stats: stats(body.hero.stats) },
    sections: sections(body.sections),
    programmes: programmes(body.programmes, mediaExists),
    highlights: highlights(body.highlights),
    social: social(body.social),
  };
}

/** Image ids used by the content (banners and programme cards). */
function mediaIdsIn(content) {
  return [...(content?.hero?.slides || []), ...(content?.programmes || [])].map((s) => s.imageId).filter(Boolean);
}

/** Social links in the shape the page renderer expects. */
function socialLinksFrom(content) {
  return Object.keys(PLATFORMS)
    .filter((platform) => content?.social?.[platform])
    .map((platform) => ({ platform, url: content.social[platform] }));
}

module.exports = { validateSiteContent, mediaIdsIn, socialLinksFrom, ValidationError, LIMITS, SECTIONS, MEDIA_ID };
