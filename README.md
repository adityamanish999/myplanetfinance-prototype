# MyPlanetFinance Website Enhancement Prototype

> **Status:** Local prototype. Implemented so far: the AI messenger (mock replies only), AP/TG ICET mock tests, and an admin dashboard for mock tests and website content.
> Items marked **[PENDING]** are unverified or undecided and need owner approval.
> This prototype runs locally only. It is not deployed and does not connect to production services.

## Objective

Build a prototype of an enhanced MyPlanetFinance website that adds:

- A Messenger-style AI chatbot for visitor questions. **(implemented with mock replies)**
- Links to the organisation's official LinkedIn and Instagram profiles.
- Mock-test modules for **AP ICET** and **Telangana ICET** aspirants.
- An admin area for editing banners, images, headings and text without code changes.
- A responsive layout inspired by the *general structure* of ibsat.org (not a copy of its content, branding or assets).

Full feature details are in [requirements.md](requirements.md). Discovery findings and the roadmap are in [docs/discovery-and-enhancement-plan.md](docs/discovery-and-enhancement-plan.md).

## Repository layout

```
.
├── README.md, CLAUDE.md, requirements.md
├── package.json / package-lock.json
├── .env.example                  # Local settings template (no secrets)
├── server/
│   ├── index.js                  # Starts the local server
│   ├── app.js                    # Express app: security headers, /api/chat, static files
│   ├── config.js                 # Reads environment variables
│   └── chat/
│       ├── chatService.js        # Timeout, PII redaction, safe error mapping
│       ├── validation.js         # Request validation and limits
│       ├── rateLimiter.js        # In-memory per-IP rate limiter
│       ├── systemPrompt.js       # Policy for a future live AI provider
│       └── providers/
│           ├── index.js          # Provider contract + factory
│           └── mockProvider.js   # Keyword-based mock replies (no network, no keys)
│   ├── mockTests/                # Exams, validation, test repository, attempts, scoring
│   ├── routes/                   # Mock-test API and admin API
│   ├── admin/adminAuth.js        # Password hashing and admin sessions
│   ├── content/                  # Content validation, draft/publish repository, image library, page rendering
│   └── storage/jsonStore.js      # Atomic JSON-file storage
├── content/site.json             # First-run social URLs (after that, edited in Admin › Website content)
├── data/seed/mock-tests.json     # Placeholder sample tests (copied to data/runtime/ on first run)
├── data/seed/site-content.json   # Placeholder homepage text (copied to data/runtime/ on first run)
├── scripts/hash-password.js      # Generates ADMIN_PASSWORD_HASH
├── public/
│   ├── index.html, mock-tests.html   # Placeholder public pages with the chat widget
│   ├── css/site.css, css/chat-widget.css
│   └── js/chat-widget.js
├── test/
│   ├── server/                   # Backend unit + HTTP tests
│   └── client/                   # Chat UI tests (jsdom)
└── docs/
```

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22.9 or newer (developed on 24.x) |
| npm | Comes with Node.js |

No API keys are needed. The chatbot uses a mock provider.

## Setup

```bash
cd MyfinancePlanet-redesign
npm install
cp .env.example .env      # optional; defaults work without it
```

Never commit `.env`.

## Running locally

```bash
npm start                 # http://127.0.0.1:3000
npm run dev               # same, restarts on file changes
npm test                  # backend + chat UI tests
```

Open http://127.0.0.1:3000 and click the chat button in the bottom-right corner. Try "Programmes", "ICET mock tests" or "Talk to a person".

To preview the error state, set `CHAT_MOCK_SIMULATE_ERRORS=true` in `.env`, restart, and send `/simulate-error`.

The server binds to `127.0.0.1` by default, so it is not reachable from other machines.

## Mock tests (AP ICET / TG ICET)

Open http://127.0.0.1:3000/mock-tests.html. Each exam has its own entry page. The flow is: entry page → instructions → confirm start → test → result.

- **Engine:**
  - The server owns the timer and the scoring.
  - Correct answers and explanations are sent only after submission.
  - Each attempt keeps a snapshot of its questions, so admin edits made during a test don't affect it.
- **Test screen:**
  - Multiple-choice answers, Previous/Next buttons, and a question palette showing answered, not answered, marked, answered + marked and not visited.
  - Mark for review, clear answer.
  - A countdown with 5-minute and 1-minute warnings, and automatic submission at time-up.
- **Protection against lost answers:**
  - Every change is saved to the server immediately.
  - Unsaved changes are backed up in the browser (`localStorage`) and retried until they are saved.
  - A refresh or a closed tab resumes the attempt, and the instructions page offers "Resume test".
  - The browser warns before leaving mid-test.
  - Submitting shows a confirmation with a summary, and is blocked while any answer is still unsaved.
  - If the student never comes back, the server auto-submits the saved answers once time is up.
- **Placeholder content:** the sample tests (`data/seed/mock-tests.json`) contain placeholder questions only. Section names, duration and instructions are placeholders until the official pattern is supplied.
- **Data storage:** runtime data (admin edits, attempts) is stored in `data/runtime/`, which is git-ignored. Delete that folder to reset to the sample tests. The database choice is still pending (D4).

## Admin setup

Admin is disabled until credentials are configured.

```bash
npm run admin:hash-password     # type a password (12+ characters); prints ADMIN_PASSWORD_HASH=...
```

Add these lines to `.env`, then restart with `npm start`:

```
ADMIN_USERNAME=<your admin username>
ADMIN_PASSWORD_HASH=<the line printed above>
```

Open http://127.0.0.1:3000/admin/. The admin has two sections: **Website content** (below) and **Mock tests**. In Mock tests you can create tests for AP ICET or TG ICET, set the duration, marking scheme, sections and instructions, and add, edit or delete questions (2–6 options, correct answer, explanation). Publish a test to make it visible to students.

- **Security:**
  - The password is stored only as a scrypt hash.
  - Sessions use an HttpOnly, SameSite=Strict cookie scoped to `/api/admin` (60 minutes by default).
  - Sign-in is rate-limited to 10 attempts per 15 minutes.
  - Cross-site writes are blocked.
  - The editor warns before you leave with unsaved changes.
- **Prototype limits:**
  - There is a single admin account.
  - Sessions live in memory, so you need to sign in again after a restart.
  - Bulk import is command-line only (see below); there is no upload screen in the admin yet.

## Website content dashboard

Admin › Website content edits the homepage without code changes:

- **Banners:** 1–5 slides, each with a label (badge), heading, highlighted line, text, image, image description (alt text), two buttons (text + link), a "show" switch and display order.
- **Figures:** up to 3 figure cards under the banners (value + label). The seed uses `[Figure]` placeholders. Only publish verified figures.
- **Section text:** headings and introductions for Programmes, ICET mock tests, Why study with us, Videos and Enquiry. The mock-test "not affiliated with the official exam authorities" disclaimer is fixed and can't be edited out.
- **Programme cards:** up to 6 programmes. Each has a name, subtitle, photo + alt text, tagline, duration, eligibility, up to 6 feature points and a card button. Empty values are hidden. Cards are coloured blue, orange and green in turn.
  - The text and photos come from the owner's "Study Programme" infographic (`content/images/study-programme.png`). The photos were cropped into `content/images/programme-*.png` and uploaded to the local image library.
  - Eligibility (owner, 2026-10-29): PGDM / MBA, an undergraduate degree; Advanced B.Com / BBA, PUC (Class 12); Investment Banking & Fund Accounting, an MBA. **[PENDING]** Durations.
- **"Why study with us" boxes:** up to 8 short items, one per line (currently the six strengths from the infographic).
- **Social links:** LinkedIn and Instagram URLs.
- **Image library:** upload, view and delete images.

**Workflow:** edit → **Save draft** → **Preview draft** (opens the homepage with your draft in a new tab, under a yellow "Preview" bar) → **Publish**. Visitors only ever see published content. **Discard draft changes** resets the draft to the live version. Publish and discard both ask for a second click to confirm.

**Validation and security:**
- Every route requires a signed-in admin. Without a session, the API returns 401 and stores nothing.
- Text is stored as plain text: control characters are removed, length limits are enforced, unknown fields are rejected, and everything is HTML-escaped when the page is rendered.
- Button links must start with `#`, `/` or `https://`, so `javascript:` and `data:` links are rejected. Social links must be https profile URLs on linkedin.com or instagram.com.
- Images must be JPEG, PNG or WebP, 5 MB or smaller, and at most 6000 × 6000 px. The type is checked from the file's bytes, and a file whose bytes don't match its declared type is rejected. SVG is not accepted.
- Uploads are stored in `data/runtime/uploads/` (outside `public/`, git-ignored) under random ids. The browser's file name is never used.
- An image is public (`/media/<id>`) only once a published banner uses it. Until then, only signed-in admins can see it. Images are served with their verified type, `nosniff` and a sandbox CSP.
- An image used by a saved or published banner can't be deleted.
- Cross-site writes are blocked (same-origin check, SameSite=Strict cookie, JSON or image content types only).

**Storage (provisional, D4/D5):** content is kept in `data/runtime/site-content.json` (draft + published) and image details in `data/runtime/media.json`. Both are saved safely, so a crash can't leave a half-written file. On first run, the content is copied from `data/seed/site-content.json` plus the social URLs in `content/site.json`.

**[PENDING]**
- Automatic resizing and compression of images (AD-3) needs an image library (e.g. `sharp`) and approval. For now, oversized images are rejected and files are stored as uploaded.
- Image metadata (EXIF, e.g. GPS location) is not stripped yet. Remove it before uploading photos.
- Change history and revert (AD-6), and roles such as Content Editor (AD-7), are not built.

## Application form and brochure

- **Apply now** (red banner button) opens `/apply.html`: a full admission application form covering programme, personal details, address, Class 10/12 and graduation marks, entrance exam, and the declaration. It checks the details in the browser (required fields, mobile, email, PIN, years, date of birth, degree for PGDM / MBA) and lists problems with links to the fields.
  - **[PENDING]** It is a demo: nothing is sent or stored. Storing student details needs an approved privacy policy and retention rule (see CLAUDE.md). The admission process, eligibility and last date also need confirming.
- **Download brochure** (blue banner button) downloads `/brochure.pdf`, built from `content/brochure.json`.
  - The brochure has a section per programme with duration, semesters, fee, payment schedule, eligibility, grades awarded and last date of application, plus the grading scheme, important dates and contact details.
  - Edit the JSON, then run `npm run build-brochure`. A test fails if the PDF is out of date.
  - **[PENDING]** All values are placeholders until the owner supplies them (no fees or dates are invented).
- **Changed `data/seed/site-content.json`?** The seed is only copied the first time. To pick up changes on an unedited install, delete `data/runtime/site-content.json` and restart. Once you have edited content in the admin, change it there instead.

## Banner image

Banner 1 uses `content/images/hero-student-photo.png` (1145×1374 PNG), an AI-generated photo supplied by the owner on 2026-10-29. It was added to the local image library and published (the same as uploading it in Admin › Website content). On a fresh install, upload it again in the admin. **[PENDING]** It does not show a real student. Replace it with a real, consented photo before launch.

## Importing a question file

Owner-supplied question files live in `data/question-banks/`. Format:

```json
{ "exam": "<test title>", "totalQuestions": 30, "questions": [
  { "id": 1, "section": "<section name>", "question": "<text>", "options": ["…", "…", "…", "…"], "answer": "C", "explanation": "<optional>" } ] }
```

`subject` is accepted in place of `section`. `answer` is a letter (A–F) matching the options (2–6 options).

```bash
npm run import-questions -- --file data/question-banks/<file>.json --check      # validate only
npm run import-questions -- --exam tg-icet --file data/question-banks/<file>.json --duration 45 [--marks 1] [--negative 0] [--publish]
```

- Stop the server before importing and restart it afterwards (it keeps tests in memory).
- Invalid questions (missing text, bad answer letter, wrong option count) are listed and skipped. Nothing is guessed or corrected.
- Suspicious questions (identical options, repeated question text, a `totalQuestions` mismatch) are imported and listed as warnings, so the owner can fix them in the admin.
- Tests are imported as drafts unless `--publish` is passed. A test with the same title in the same exam is refused.
- Imported so far: `AP ICET Practice Set 1` and `TG ICET Practice Set 1` (30 questions each, published locally). **[PENDING]** TG ICET question 8 has two identical options ("HTRON"), so the owner needs to confirm the correct options.

## Social media links

Official LinkedIn and Instagram URLs are edited in **Admin › Website content › Social media links**, then published.

- Only `https://` URLs on `linkedin.com` / `instagram.com` with a profile path are accepted.
- An empty value means that icon is not shown. The footer then says "Social media links coming soon".
- Links appear in the top bar (icons) and the footer (icon + name) on every public page. They open in a new tab.
- `content/site.json` is read only once, the first time the content store is created (it seeds the URLs). After that, edit the links in the admin.

**[PENDING]** The owner has not supplied the official URLs yet, so both values are empty.

## Chat API

`POST /api/chat` with `Content-Type: application/json`:

```json
{ "message": "What programmes do you offer?", "history": [{ "role": "user", "content": "Hi" }, { "role": "assistant", "content": "Hello!" }] }
```

| Status | Body |
|--------|------|
| 200 | `{ "reply": "..." }` |
| 400 / 413 / 415 | `{ "error": { "code": "INVALID_REQUEST" \| "INVALID_JSON" \| "PAYLOAD_TOO_LARGE" \| "UNSUPPORTED_MEDIA_TYPE", "message": "..." } }` |
| 429 | `RATE_LIMITED`, with a `Retry-After` header |
| 502 / 504 | `PROVIDER_ERROR`, `EMPTY_REPLY` or `TIMEOUT` (generic message, no internals) |

Limits: message ≤ 1000 characters, history ≤ 20 turns, body ≤ 16 KB, 10 requests per minute per IP (configurable).

## Contributing

Follow the rules in [CLAUDE.md](CLAUDE.md). Changes go through review before merge. Nothing is pushed without owner approval.
