# Website Audit

> **Status: NOT YET PERFORMED.** No live site, private source code or production service has been accessed.
> Every observation below is **[PENDING — UNVERIFIED]** until reviewed against the public site and confirmed by the owner.

## 1. Scope

| Item | Value |
|------|-------|
| Current site URL | **[PENDING — owner to confirm]** |
| Audit date | **[PENDING]** |
| Auditor | **[PENDING]** |
| Method | Public pages only, viewed in a browser. No login, no scraping of private areas, no load testing. |

## 2. Current-site observations

| Area | Observation | Status |
|------|-------------|--------|
| Pages & navigation | — | [PENDING — UNVERIFIED] |
| Branding (logo, colours, fonts) | — | [PENDING — UNVERIFIED] |
| Content (courses, services, contact) | — | [PENDING — UNVERIFIED] |
| Existing social-media links | — | [PENDING — UNVERIFIED] |
| Existing chat / contact widgets | — | [PENDING — UNVERIFIED] |
| Existing mock tests / exam content | — | [PENDING — UNVERIFIED] |
| Mobile responsiveness | — | [PENDING — UNVERIFIED] |
| Page speed (Lighthouse) | — | [PENDING — UNVERIFIED] |
| Accessibility issues | — | [PENDING — UNVERIFIED] |
| SEO basics (titles, meta, sitemap.xml) | — | [PENDING — UNVERIFIED] |
| HTTPS / security headers (public check only) | — | [PENDING — UNVERIFIED] |
| Hosting / CMS in use | — | [PENDING — UNVERIFIED] |

## 3. Reference site: ibsat.org (layout inspiration only)

Reviewed from the owner's desktop screenshot of the home page (2026-10-29). Only the layout is borrowed. MyPlanetFinance keeps its own colours, text, logo and imagery.

| Pattern | Reference layout | Prototype implementation | Status |
|---------|------------------|--------------------------|--------|
| Top bar | Full-width coloured strip: social icons left, phone right | Social icons left, hours + phone (placeholder) right, in the MyPlanetFinance dark blue | Done |
| Navigation | Logo left; pill-shaped menu links with the current page filled; actions on the right | Pill links with `aria-current` filled; "Enquire now" on the right (desktop ≥1200px) | Done |
| Hero / banner | Dark full-width band in three columns: badge, large heading with a highlighted line, two buttons and three figure cards; a cut-out person photo; an enquiry form card | Same three-column structure. Admin edits the badge, heading, highlighted line, text, buttons, image and up to 3 figures. The demo enquiry form moved into the hero | Done (figures and photo are owner-supplied, **[PENDING]**) |
| Enquiry form | Form card in the hero with OTP, graduation year, state, city | Name, phone/email, programme, consent. Still a demo: nothing is sent or stored. OTP and extra fields **[PENDING]** (needs the privacy decision) | Partial |
| Chat launcher | Floating bubble at the bottom right | Existing AI chat widget | Done |
| Content sections | Only the start of the next section is visible ("About", dark band) | Existing sections kept | **[PENDING]** more screenshots |
| Footer | Not visible in the screenshot | Existing footer kept | **[PENDING]** |
| Mobile behaviour | Not supplied | Hero stacks (text → image → figures → form). The menu is a one-line sideways-scrolling pill row. Checked at 360, 768, 1024 and 1440px with no horizontal overflow | Done (unverified against the reference) |

Only general layout patterns are recorded here. Text, images, logos, colours and code from ibsat.org must not be reused.

## 4. Findings and recommendations

**[PENDING]** — to be filled after the audit.
