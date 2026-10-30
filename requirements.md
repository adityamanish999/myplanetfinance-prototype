# Requirements — MyPlanetFinance Website Enhancement Prototype

> Items marked **[PENDING]** require confirmation from the project owner.
> Priority key: **M** = must have for prototype, **S** = should have, **C** = could have.

## 1. Messenger-style AI chatbot

| ID | Requirement | Priority |
|----|-------------|----------|
| CB-1 | Floating chat launcher (bottom-right) available on all public pages. | M |
| CB-2 | Chat panel with message bubbles, timestamps, typing indicator and scrollable history, similar in feel to common messenger apps. | M |
| CB-3 | Answers general questions about MyPlanetFinance services, courses and mock tests using **owner-approved content only**. | M |
| CB-4 | Clearly labelled as an AI assistant; shows a disclaimer that answers may be inaccurate and are not financial or admissions advice. | M |
| CB-5 | Fallback hand-off option (e.g. "Contact us" form or human contact) when the bot cannot answer. Contact channel **[PENDING]**. | M |
| CB-6 | Works on mobile (full-screen panel on small screens) and is keyboard/screen-reader accessible. | M |
| CB-7 | Rate limiting and input length limits to control abuse and cost. | M |
| CB-8 | No collection of personal data in chat unless consent and retention policy are approved. **[PENDING]** | M |
| CB-9 | Admin can edit the bot's welcome message and suggested quick-reply questions. | S |
| CB-10 | Conversation logging for quality review — **[PENDING]** (privacy decision). | C |

AI provider, model and hosting: **[PENDING]** — see `docs/technical-architecture.md`.

## 2. LinkedIn and Instagram links

| ID | Requirement | Priority |
|----|-------------|----------|
| SM-1 | LinkedIn and Instagram icons in the header and/or footer. | M |
| SM-2 | Links open in a new tab with `rel="noopener noreferrer"`. | M |
| SM-3 | Icons have accessible labels (e.g. "MyPlanetFinance on LinkedIn"). | M |
| SM-4 | URLs are editable from the admin panel, not hard-coded. | S |
| SM-5 | Official profile URLs: **[PENDING — owner must supply]**. Until supplied, use a clearly fake placeholder (`#`) and hide the icon in production builds. | M |

## 3. AP ICET and Telangana ICET mock-test modules

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-1 | Separate sections for **AP ICET** and **TS (Telangana) ICET** mock tests. | M |
| MT-2 | Test structure (sections, number of questions, duration, marking scheme) must be configurable, not hard-coded. Official exam pattern **[PENDING — must be verified against the official notification for the relevant year]**. | M |
| MT-3 | Timed test with countdown, question navigator, mark-for-review, and auto-submit on time-out. | M |
| MT-4 | Result page with score, section-wise breakdown, and answer explanations. | M |
| MT-5 | Question bank managed by admin (create, edit, import, publish/unpublish). | M |
| MT-6 | **No real or invented exam questions are included in this repository.** Development uses obviously placeholder questions (e.g. "Sample question 1 — placeholder"). Real content is supplied and approved by the owner. | M |
| MT-7 | Bilingual support (English / Telugu) — **[PENDING]**. | C |
| MT-8 | Whether tests require login, and whether attempts are saved per user — **[PENDING]**. | S |
| MT-9 | Free vs paid tests and any payment integration — **[PENDING]** (out of scope for prototype unless approved). | C |
| MT-10 | Disclaimer that these are practice tests and not affiliated with the exam-conducting authorities. | M |

## 4. Admin customisation

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-1 | Secure admin login (separate from any student accounts). | M |
| AD-2 | Edit homepage banners/hero slides: image, heading, sub-text, button label and link, display order, active/inactive. | M |
| AD-3 | Upload and replace images with type/size validation and automatic resizing/compression. | M |
| AD-4 | Edit page headings and text blocks for key pages (Home, About, Courses, Contact). | M |
| AD-5 | Preview changes before publishing. | S |
| AD-6 | Change history / ability to revert content. | C |
| AD-7 | Role separation (e.g. Admin vs Content Editor) — **[PENDING]**. | C |
| AD-8 | Manage mock-test question banks (see MT-5) and social links (see SM-4). | M |

Admin approach (custom panel vs headless CMS) **[PENDING]**.

## 5. Responsive design (inspired by ibsat.org layout)

| ID | Requirement | Priority |
|----|-------------|----------|
| RD-1 | Layout inspired by the **general structure** of ibsat.org (e.g. top bar, navigation, hero banner, sectioned content, footer). Homepage patterns were reviewed from the owner's desktop screenshot on 2026-10-29 (see `docs/website-audit.md` §3). Mobile and inner pages are **[PENDING]**. | M |
| RD-2 | **Do not copy** ibsat.org text, images, logos, colours, code or branding. Use MyPlanetFinance branding only. | M |
| RD-3 | Mobile-first; tested at ~360px, 768px, 1024px and 1440px widths. | M |
| RD-4 | Accessibility target: WCAG 2.1 AA (contrast, keyboard navigation, alt text, focus states). | M |
| RD-5 | Performance target: Lighthouse performance ≥ 85 on mobile for the homepage — target **[PENDING approval]**. | S |
| RD-6 | Brand assets (logo, colour palette, fonts) — **[PENDING — owner to supply]**. | M |

## 6. Out of scope (prototype)

- Migration of existing production content or user data.
- Payment processing.
- Integration with production services, analytics or CRM.
- Native mobile apps.

## 7. Open questions

All items marked **[PENDING]** above, plus the pending decisions tables in `docs/technical-architecture.md` (D1–D12) and `docs/deployment-plan.md` (P1–P6).
