'use strict';

// Only official profile URLs on these hosts are accepted; anything else is ignored.
const PLATFORMS = {
  linkedin: {
    name: 'LinkedIn',
    hosts: ['linkedin.com', 'www.linkedin.com'],
    icon:
      '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle>',
  },
  instagram: {
    name: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    icon:
      '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>',
  },
};

const BRAND = 'MyPlanetFinance';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns the normalised URL if it is an https profile URL on the platform's own domain, else null. */
function normalizeSocialUrl(platform, value) {
  const spec = PLATFORMS[platform];
  if (!spec || typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!spec.hosts.includes(url.hostname.toLowerCase())) return null;
  if (url.pathname.replace(/\/+$/, '') === '') return null;
  return url.href;
}

function linkAttributes({ platform, url }) {
  const { name } = PLATFORMS[platform];
  return `href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${BRAND} on ${name} (opens in a new tab)" data-social="${platform}"`;
}

function iconSvg(platform) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PLATFORMS[platform].icon}</svg>`;
}

/** Compact icon-only links for the header top bar. Renders nothing when no URL is configured. */
function renderSocialIcons(links) {
  if (!links.length) return '';
  const items = links
    .map((link) => `<a class="social-link" ${linkAttributes(link)}>${iconSvg(link.platform)}</a>`)
    .join('');
  return `<nav class="topbar__social" aria-label="Social media">${items}</nav>`;
}

/** Icon + text links for the footer, with a neutral fallback when nothing is configured. */
function renderSocialList(links) {
  if (!links.length) return '<span class="social-pending">Social media links coming soon</span>';
  return links
    .map(
      (link) =>
        `<a class="social-list-link" ${linkAttributes(link)}>${iconSvg(link.platform)}<span>${PLATFORMS[link.platform].name}</span></a>`,
    )
    .join('');
}

module.exports = { PLATFORMS, normalizeSocialUrl, renderSocialIcons, renderSocialList, escapeHtml };
