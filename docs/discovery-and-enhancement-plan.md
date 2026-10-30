# Discovery & Enhancement Plan — MyPlanetFinance Website

> **Status: DRAFT — awaiting owner approval.** No application work proceeds until this plan is approved.
> Discovery date: 2026-10-29. Method: automated fetch of publicly accessible pages only (no login, no private areas, no source code).
> Labels: **[VERIFIED]** = observed on the public site on the discovery date · **[PENDING]** = unverified or undecided · **[OWNER]** = must be supplied/confirmed by the website owner.

---

## 1. Discovery summary

### 1.1 Existing website — https://www.myplanetfinance.com/

**Pages inspected [VERIFIED]** (from the site's public `sitemap.xml`): Home, About Us, Faculties, Videos, Contact Us, Privacy Policy.
`robots.txt` disallows `/login`, `/my-account`, `/cart` — these were **not** accessed.

**Key findings**

| Area | Observation | Label |
|------|-------------|-------|
| Identity | Site presents itself as **"planet FINANCE BUSINESS SCHOOL"** — an educational institution in Madhapur, Hyderabad (PGDM/MBA, Advanced B.Com/BBA, Investment Banking & Fund Accounting programmes). The brand name differs from "MyPlanetFinance" (the domain). | [VERIFIED] · naming to confirm [OWNER] |
| Platform | Assets served from `image.jdomni.in` and a "Powered By Justdial" footer suggest a **Justdial JD Omni** hosted storefront template. No access to its source is possible or required. | [PENDING — inferred, not confirmed] |
| Navigation | No clearly labelled primary navigation; several icon links point to `javascript:void(0)`. Pages are reachable mainly via sitemap. | [VERIFIED] |
| Header | Location text, multiple phone/email links, Justdial icon, logo, "Log In \| Sign Up", cart (0). Logo slot shows a blank placeholder image. | [VERIFIED] |
| Home | Single banner image (no headline), "About Us" text, "Key Highlights" list, a placement-count claim, a "Submit" button with no visible fields. | [VERIFIED] |
| About Us | Contains no descriptive content beyond contact blocks. | [VERIFIED] |
| Faculties | Two text-only entries (name, credential, bullet bio); no photos. | [VERIFIED] |
| Videos | Hero with un-edited template text ("Click here to edit the subtitle"); 8 video **titles** listed with no embeds or links; some titles misspelt. | [VERIFIED] |
| Contact Us | Office addresses, phone, email, timings, "Get Direction" map showing "location information is unavailable", Submit button with no visible fields. | [VERIFIED] |
| Contact data quality | Phone numbers differ between pages/sections; one malformed `tel:` link; a personal Gmail address appears alongside the business email. | [VERIFIED] · correct set [OWNER] |
| Social media | **No LinkedIn or Instagram links.** Only Justdial listing and a WhatsApp click-to-chat link. | [VERIFIED] |
| Chat | No chatbot; WhatsApp popup only. | [VERIFIED] |
| Exams / mock tests | **No ICET or mock-test content.** | [VERIFIED] |
| Language | Google-Translate-style selector (10 Indian languages incl. Telugu). | [VERIFIED] |
| Privacy policy | Names "planet FINANCE BUSINESS SCHOOL"; mentions collecting name, email, address, phone, card details, cookies for cart; generic e-commerce wording; no mention of chat, WhatsApp or Justdial's role. | [VERIFIED] |
| Security headers (public response) | HTTPS + HSTS, `X-Frame-Options: sameorigin`, CSP limited to `frame-ancestors`. Third-party cookies set with `SameSite=None`. | [VERIFIED] |
| Performance, accessibility, mobile rendering | Not measured (requires a browser audit). | [PENDING] |

**Implication:** the prototype is effectively a **rebuild**, not an enhancement of existing code. Content quality issues (placeholders, inconsistent contacts, empty About page) should be fixed with owner-supplied content rather than migrated as-is.

### 1.2 Design reference — https://ibsat.org/

**Name corrected on 2026-10-29.** The docs originally said `lbsat.org`, which does not resolve. The owner confirmed the reference is **ibsat.org** by supplying a desktop screenshot of its home page. The live site renders with JavaScript, so it was reviewed from that screenshot only (no mobile or inner-page views yet). Layout patterns taken from it are listed in `website-audit.md` §3.

**Still needed from you [OWNER]:** a mobile screenshot, and any inner page or footer you'd like matched.

### 1.3 Comparison (provisional)

| Dimension | Existing site | Reference (ibsat.org) | Target for prototype |
|-----------|---------------|-----------------------|----------------------|
| Page structure | 5 thin pages, template sections | [PENDING] | Clear hierarchy: Home → Programmes / Mock Tests / About / Faculty / Videos / Contact |
| Navigation | No labelled menu | [PENDING] | Labelled top nav + mobile menu; primary CTA ("Enquire" / "Take a Mock Test") |
| Visual hierarchy | Banner without headline; lists of text | [PENDING] | Headline hero, section headings, cards, consistent spacing |
| User journeys | Call / WhatsApp only | [PENDING] | (a) explore programmes → enquire; (b) find ICET mock test → take test → see result; (c) ask chatbot → hand-off to contact |

---

## 2. Proposed sitemap

```
/                               Home
├── /programmes                 Programmes overview                [content OWNER]
│   └── /programmes/:slug       Programme detail (PGDM/MBA, B.Com/BBA, IB & FA — confirm list)
├── /mock-tests                 Mock-test hub (disclaimer, how it works)
│   ├── /mock-tests/ap-icet     AP ICET tests
│   │   └── /:testId → /:testId/result
│   └── /mock-tests/ts-icet     Telangana ICET tests
│       └── /:testId → /:testId/result
├── /about                      About the institution              [content OWNER]
├── /faculty                    Faculty profiles                   [content + consent OWNER]
├── /videos                     Video gallery                      [video URLs OWNER]
├── /contact                    Enquiry form, offices, timings, map
├── /privacy                    Privacy policy                     [legal text OWNER]
└── /terms                      Terms & disclaimers                [legal text OWNER]

Global: header nav · footer (LinkedIn, Instagram, WhatsApp, Justdial — URLs OWNER) · chatbot launcher

/admin  (auth required, not linked publicly)
  banners · pages & text blocks · media library · programmes · faculty · videos
  · mock tests & question banks · social links · chatbot settings · enquiries · users
```

Student login (`/login`, `/my-results`) — **[PENDING decision]**.
Redirects from current URLs (e.g. `/about-us/page-58003822` → `/about`) — required if the prototype replaces the live site **[PENDING]**.

---

## 3. Page-by-page requirements

| Page | Must include | Admin-editable | Owner inputs |
|------|-------------|----------------|--------------|
| **Home** | Hero slider (heading, subtext, CTA), programme cards, mock-test CTA (AP / TS), highlights, placement/stats strip (only owner-verified figures), latest videos, enquiry CTA | All banners, headings, text, cards, stats, order, visibility | Hero images, headlines, verified stats |
| **Programmes** | Cards → detail pages: overview, duration, eligibility, curriculum outline, career outcomes, enquire CTA | Full CRUD | Programme list and accurate details (no fees shown unless supplied) |
| **Mock-test hub** | Explanation, AP ICET and TS ICET as **separate** sections, disclaimer "not affiliated with APSCHE/TGCHE or exam conducting universities" | Intro text, disclaimer | Confirmation of exam bodies' names for the target year |
| **Test list (per exam)** | Published tests with title, duration, question count, difficulty | Tests, publish state | — |
| **Test player** | Countdown timer, section tabs, question palette, mark-for-review, auto-submit, mobile layout, resume on refresh | — | — |
| **Result** | Score, section-wise breakdown, correct answers and explanations (shown only after submit) | Explanations | — |
| **About** | Story, mission, recognitions/affiliations (only verified), campus images | All | Text, images, accreditation proof |
| **Faculty** | Profile cards (photo optional) | Full CRUD | Profiles + **written consent** to publish |
| **Videos** | Responsive grid of embedded videos (privacy-enhanced embeds) | Full CRUD | Video URLs / channel |
| **Contact** | Enquiry form (name, phone/email, programme interest, message, consent checkbox), single verified contact set, timings, map | Contact details, timings | Correct phones/emails/addresses, map location |
| **Privacy / Terms** | Owner-approved legal text | Text | Legal text |
| **Global header/footer** | Logo, nav, CTA, social icons (LinkedIn, Instagram + WhatsApp/Justdial if kept), language toggle (EN/TE pending) | Social URLs, nav labels, footer text | Official social URLs, logo |
| **Chatbot** | See §4.1 | Welcome text, quick replies, enable/disable, knowledge FAQ | Approved FAQ answers |
| **Admin** | Login (MFA pending), role-based access, preview, audit log of edits | — | Admin users list |

---

## 4. Feature requirements (summary)

Detailed IDs remain in `/requirements.md` (CB, SM, MT, AD, RD). Discovery adds:

### 4.1 Messenger-style AI chatbot
- Floating launcher on all public pages; full-screen panel on mobile; typing indicator, error + retry, AI-assistant label and disclaimer.
- Answers only from an **owner-approved FAQ** (programmes, mock tests, contact hand-off). Never invents fees, dates, placements or contact details.
- Hand-off: "Talk to us" → WhatsApp / contact form (owner to confirm which).
- Server-side provider integration only; mock provider for development; rate limiting, input validation, PII redaction, no chat-log storage until a retention policy is approved.

### 4.2 LinkedIn & Instagram
- Currently absent on the site. Owner must supply official URLs; icons hidden until supplied.

### 4.3 AP ICET & Telangana ICET mock tests
- Two separate exam sections with configurable pattern (sections, question counts, duration, marking) entered by admin from the **official notification** for the target year — not hard-coded.
- Question content supplied/authored by the owner's faculty; original questions only unless rights to past papers are confirmed.
- Bulk import (CSV/Excel template) for question banks.

### 4.4 Admin customisation
- Banners, images, headings, text blocks, programmes, faculty, videos, social links, chatbot settings, mock tests.
- Image upload with validation, resizing, alt text required.

### 4.5 Responsive layout
- Mobile-first, breakpoints ~360 / 768 / 1024 / 1440px, WCAG 2.1 AA.
- Information architecture inspired by the reference **[PENDING review]**; no copying of the reference's text, images, logos, colours or code.

---

## 5. Design system (proposal)

Brand colours, logo and fonts are **[OWNER]**; values below are placeholders for structure only.

| Element | Proposal |
|---------|----------|
| Colour tokens | `--color-primary`, `--color-primary-contrast`, `--color-accent`, `--color-surface`, `--color-surface-alt`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-success`, `--color-warning`, `--color-danger`. All text pairs ≥ 4.5:1 contrast. |
| Typography | One sans-serif family with Telugu support (e.g. an open-licence font such as Noto Sans + Noto Sans Telugu) **[PENDING]**. Scale: 14 / 16 (body) / 18 / 22 / 28 / 36 / 48px. |
| Spacing | 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Section padding 48–64px desktop, 32px mobile. |
| Radius & elevation | Radius 4 / 8 / 16px; two shadow levels (card, overlay). |
| Grid | 12-column, max content width ~1200px, 16px mobile gutters. |
| Components | Header + mobile drawer, hero slider, section heading, card (programme, faculty, video, test), stats strip, CTA band, accordion (FAQ), tabs, form fields + validation states, buttons (primary/secondary/ghost), badges, alert/toast, modal, chat widget, test player (timer, palette, question), result summary, footer, admin tables/forms. |
| Iconography | Open-licence icon set (e.g. Lucide) **[PENDING]**; official LinkedIn/Instagram marks used per their brand guidelines. |
| Motion | Subtle (≤200ms), respects `prefers-reduced-motion`; hero auto-advance pausable. |

Deliverable before build: a clickable mock-up of Home, Mock-test player and Admin banner editor for sign-off.

---

## 6. Technical architecture (proposal)

All choices **[PENDING approval]**.

| Concern | Recommendation | Alternative |
|---------|----------------|-------------|
| Web framework | **Next.js (React, TypeScript)** — SSR for SEO, good mobile performance | Node/Express + server-rendered templates |
| Admin / CMS | **Payload CMS** (runs inside Next.js; auth, roles, media uploads, versioning out of the box) | Custom admin panel (more effort); Strapi |
| Database | **PostgreSQL** (SQLite acceptable for local prototype) | MySQL |
| Media | Local disk in prototype; S3-compatible storage for staging | CMS-managed cloud storage |
| Chat backend | Server route → `ChatProvider` interface → mock provider now, approved AI provider later | — |
| Mock-test engine | Server-side timing and scoring; answers never sent before submit | — |
| Styling | Tailwind CSS or CSS modules with design tokens | Plain CSS |
| Testing | Vitest (unit), Playwright (E2E + responsive + a11y with axe) | Jest |
| Hosting (staging) | **[PENDING]** — e.g. Vercel/Railway/Render with managed Postgres | VPS |

```
Browser ──▶ Next.js app ──┬─▶ Payload CMS (admin, content API) ──▶ PostgreSQL / media
                          ├─▶ /api/chat ──▶ ChatProvider (mock | approved AI) 
                          └─▶ /api/mock-tests (attempts, scoring)
```

**Note on work already started:** a partial Express-based chat module was written before this discovery task (`server/`, `package.json`, `.env.example`; no UI or tests yet). Its validation, rate-limiting, PII-redaction and provider-interface logic is portable to the recommended stack; the Express wiring would be replaced if Next.js is approved.

---

## 7. Information & assets required from the owner

1. Official business name and brand to use ("MyPlanetFinance" vs "planet FINANCE BUSINESS SCHOOL").
2. Logo (vector), brand colours, fonts (or approval to use proposed open-licence fonts).
3. Official LinkedIn and Instagram URLs; decision on keeping WhatsApp and Justdial links.
4. One verified set of phone numbers, email, addresses, timings and map location.
5. Programme list and accurate details (duration, eligibility, curriculum, outcomes; fees only if to be published).
6. About-us text, accreditations/affiliations (with proof), verified placement statistics and their source.
7. Faculty profiles, photos and written consent to publish.
8. Video URLs / YouTube channel.
9. Hero/banner images and campus photos, with confirmation of ownership or licence.
10. AP ICET and TS ICET: target year, official exam pattern source, question banks with explanations, author/rights confirmation.
11. Approved chatbot FAQ and hand-off channel.
12. Privacy policy and terms (updated for enquiries, chatbot and mock tests).
13. Admin user list and roles.
14. Mobile and inner-page screenshots of ibsat.org (desktop home page received 2026-10-29).
15. Domain/DNS ownership details and current Justdial contract terms (for eventual launch).

---

## 8. Risks

### Security
| Risk | Mitigation |
|------|-----------|
| Admin account compromise → defacement | Strong passwords, MFA, rate-limited login, roles, audit log |
| Malicious uploads | Image-type allow-list, size limits, re-encoding, no SVG unless sanitised |
| XSS via admin rich text | Sanitised rich-text renderer, strict CSP |
| Chatbot prompt injection / abuse / cost spikes | Topic-restricted prompt, server-side key, rate limits, spending cap, no tool access |
| Mock-test cheating via client inspection | Server-side answers, timing and scoring |
| Spam enquiries | Rate limiting + CAPTCHA/honeypot **[PENDING]** |

### Privacy (India — Digital Personal Data Protection Act, 2023)
| Risk | Mitigation |
|------|-----------|
| Enquiry form / test attempts collect personal data | Purpose-specific consent checkbox, privacy notice, minimal fields, retention period **[OWNER]** |
| Chat messages containing personal data | Warn users, redact PII server-side, no log storage until approved |
| Faculty personal data | Written consent before publishing |
| Third-party processors (AI provider, hosting, WhatsApp, YouTube embeds, Google Translate) | Disclose in privacy policy; data-processing terms review |
| Current policy mentions card data and cart cookies not relevant to the new site | Rewrite policy for the new site **[OWNER/legal]** |

### Licensing & content
| Risk | Mitigation |
|------|-----------|
| Copying design/content from reference site | Inspiration for IA only; original design and copy |
| Past ICET papers may be copyrighted by the conducting university/council | Use original questions unless written rights confirmed |
| Images currently hosted on Justdial CDN — ownership unclear | Owner to supply originals with rights |
| Fonts/icons licences | Use open-licence (OFL/ISC/MIT) assets only |
| Social-media brand marks | Follow LinkedIn/Instagram brand guidelines |
| Unverified marketing claims (e.g. placement counts) | Publish only owner-verified figures with source |

### Integration
| Risk | Mitigation |
|------|-----------|
| Current site is a Justdial-hosted template — no code export; content must be re-entered | Content inventory + manual migration by admin |
| Domain/DNS may be managed via Justdial | Confirm ownership and access before any launch plan |
| URL changes break existing links/SEO | 301 redirect map at launch |
| AI provider not yet chosen | Provider interface + mock; selection gate in roadmap |
| WhatsApp/Justdial lead flows | Keep links; confirm whether enquiries should also reach email/CRM |

---

## 9. Implementation roadmap

| Phase | Scope | Exit criteria (owner approval required) |
|-------|-------|------------------------------------------|
| **0. Discovery & approval** (this document) | Audit, sitemap, requirements, risks | Plan approved; reference-site screenshots received; stack decisions D1–D12 signed off |
| **1. Content & design** | Content inventory, owner assets collected, design tokens, wireframes, clickable mock-up of Home / Test player / Admin banner editor | Mock-up approved |
| **2. Foundation** | Project scaffold, CI (lint + tests), CMS + database, auth, design-system components, global layout (header/footer/social links) | Responsive shell passes a11y checks at all breakpoints |
| **3. Content pages + admin** | Home (hero slider), Programmes, About, Faculty, Videos, Contact (enquiry form), Privacy/Terms; admin editing for all | Owner can change banners, images, headings and text without code |
| **4. Mock-test modules** | AP ICET & TS ICET sections, configurable patterns, question import, test player, results | Full test flow passes E2E on mobile and desktop with placeholder questions; owner loads real questions |
| **5. Chatbot** | Widget, chat API, mock provider, validation, rate limiting, PII redaction; then approved AI provider with FAQ knowledge | Mock-mode tests pass; provider approved; spending cap set; FAQ approved |
| **6. Hardening** | Security checklist, performance (Lighthouse), accessibility audit, privacy review, content proofreading | All checklist items closed or accepted |
| **7. Staging & UAT** | Deploy to staging (no production), owner acceptance testing | Owner sign-off; separate production launch plan |

Phases 3–5 can run partly in parallel after Phase 2.

---

## 10. Decisions awaiting approval

1. Approve this plan (sitemap, page requirements, roadmap).
2. Reference site: correct URL or screenshots.
3. Brand name to use.
4. Stack: Next.js + Payload CMS + PostgreSQL (recommended) vs Express + custom admin.
5. What to do with the partial Express chat module (keep as reference / port / delete).
6. Student login for mock tests: yes/no.
7. Languages: English only, or English + Telugu.
8. Chatbot hand-off channel (WhatsApp, contact form, both).
9. Keep WhatsApp and Justdial links alongside LinkedIn/Instagram.
10. AI provider (can be deferred to Phase 5).
