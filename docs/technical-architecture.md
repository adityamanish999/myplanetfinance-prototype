# Technical Architecture

> **Status: DRAFT.** No technology has been selected. All choices below are **[PENDING]** owner approval.
> Options are listed for discussion only.

## 1. Logical components

```
┌────────────────────────┐      ┌──────────────────────────┐
│  Public website (UI)   │─────▶│  Application API         │
│  - pages, banners      │      │  - content endpoints     │
│  - mock-test player    │      │  - mock-test endpoints   │
│  - chatbot widget      │      │  - chatbot proxy         │──▶ AI provider [PENDING]
└────────────────────────┘      │  - admin endpoints (auth)│
┌────────────────────────┐      └────────────┬─────────────┘
│  Admin panel (UI)      │──────────────────▶│
└────────────────────────┘                   ▼
                                ┌──────────────────────────┐
                                │ Database      [PENDING]  │
                                │ Media storage [PENDING]  │
                                └──────────────────────────┘
```

Key principle: the browser never calls the AI provider directly. All AI calls go through the server so API keys stay server-side.

## 2. Pending decisions

| # | Decision | Options (not exhaustive) | Status |
|---|----------|--------------------------|--------|
| D1 | Front-end framework | Next.js (React), Astro, plain HTML/CSS/JS | **[PENDING]** |
| D2 | Back-end / API | Next.js API routes, Node/Express, Python (FastAPI/Django) | **[PENDING]** |
| D3 | Admin / content management | Custom admin panel, headless CMS (e.g. Strapi, Payload, Sanity), Django admin | **[PENDING]** |
| D4 | Database | PostgreSQL, MySQL, SQLite (prototype only) | **[PENDING]** for production. Prototype uses JSON files (owner, 2026-10-29) |
| D5 | Media storage | Local disk (prototype), S3-compatible object storage, CMS-managed | **[PENDING]** for production. Prototype uses local disk (owner, 2026-10-29) |
| D6 | AI chatbot provider & model | Anthropic Claude, other providers; hosted vs self-hosted | **[PENDING]** |
| D7 | Chatbot knowledge source | Static FAQ prompt, retrieval over admin-managed content | **[PENDING]** |
| D8 | Authentication | Framework auth library, CMS built-in auth, managed identity provider | **[PENDING]** |
| D9 | Styling | Tailwind CSS, CSS modules, plain CSS | **[PENDING]** |
| D10 | Hosting | **[PENDING]** — see `deployment-plan.md` | **[PENDING]** |
| D11 | Language support (English/Telugu) | i18n library choice | **[PENDING]** |
| D12 | Testing tools | Unit (e.g. Vitest/Jest/pytest), E2E (e.g. Playwright) | **[PENDING]** |

## 3. Proposed data entities (draft)

| Entity | Key fields |
|--------|-----------|
| Banner | id, image, heading, subtext, button_label, button_link, order, active |
| PageBlock | id, page, key, heading, body, updated_at, updated_by |
| MediaAsset | id, filename, url, alt_text, size, uploaded_by |
| SocialLink | id, platform (linkedin / instagram), url, active |
| Exam | id, code (AP_ICET / TS_ICET), name |
| MockTest | id, exam_id, title, duration_minutes, marking_scheme, published |
| Section | id, mock_test_id, name, order |
| Question | id, section_id, text, options, correct_option, explanation |
| Attempt | id, mock_test_id, user_id (nullable — PENDING), answers, score, started_at, submitted_at |
| AdminUser | id, email, password_hash, role |
| ChatbotConfig | welcome_message, quick_replies, enabled |

Exam pattern values (section counts, duration, marks) are **data**, entered by admin from the official notification — never hard-coded.

## 4. Chat module (implemented, provisional stack)

Built on Node.js + Express with a plain-JS widget so the chatbot can be tested before D1–D12 are decided. The logic modules have no Express dependency and can be ported.

```
Browser widget (public/js/chat-widget.js)
   │  POST /api/chat  { message, history }
   ▼
server/app.js ── rate limit (per IP) ── JSON only, ≤16 KB ── validation.js
   ▼
chatService.js ── PII redaction ── timeout ── reply length cap ── safe error mapping
   ▼
providers/index.js ── ChatProvider contract ──▶ mockProvider.js (now)
                                             └─▶ <approved>Provider.js (later; key read from env, server-side)
```

**Provider contract:** `generateReply({ message, history, systemPrompt, signal }) → Promise<{ text }>`. To add a live provider, implement the contract, read the key from `process.env` inside the provider module, register it in `providers/index.js`, and set `CHAT_PROVIDER`. Unknown providers fail at startup.

**Safeguards in place:**
- The key never enters shared config or the browser.
- Logs record error types only, never message content.
- Emails and 10+-digit numbers are redacted before reaching a provider.
- Responses to the browser contain only `{ reply }` or `{ error: { code, message } }`.
- CSP and other security headers are set.
- The server binds to localhost by default.

**Known prototype limits:**
- The rate limiter is in-memory and per process; replace it with a shared store before running more than one instance.
- There is no CSRF token; the endpoint changes no state, so this must be revisited if it ever does.
- `trust proxy` is off; configure it if the server is deployed behind a proxy.

## 5. Mock-test engine (implemented, provisional stack)

```
Entry page (ap-icet / tg-icet) → instructions + start confirmation → test player → result
            │                               │                        │
   GET /api/exams/:exam/tests     POST /api/tests/:id/attempts   PUT  /api/attempts/:id/answers/:qid  (each change)
                                                                 POST /api/attempts/:id/submit
                                                                 GET  /api/attempts/:id/result        (after submit only)

Admin (/admin/) → /api/admin/* (session cookie) → testRepository → JSON store (data/runtime/mock-tests.json)
```

- **Modules:**
  - `server/mockTests/`: `exams.js`, `testValidation.js`, `testRepository.js`, `attemptService.js`, `scoring.js`
  - `server/routes/`: `mockTestsRouter.js`, `adminRouter.js`
  - `server/admin/adminAuth.js`
  - `server/storage/jsonStore.js`
- **Attempts:**
  - Each attempt stores a snapshot of its questions (including the answers, server-side only).
  - The deadline is `startedAt + duration`. Answers are accepted for up to 10 seconds after it, to allow for network delay.
  - Any access after that auto-submits the attempt.
  - Attempt IDs are random UUIDs and act as the access key, since there are no student accounts yet (student login is still pending).
  - Attempts are pruned after 7 days.
- **Storage:**
  - A JSON file per collection, written atomically (temp file + rename).
  - Single process only. Replace it with the approved database (D4) before multi-instance or production use.
- **Known prototype limits:**
  - Admin sessions and rate limiters are in memory.
  - There is a single admin account.
  - Bulk question import is a CLI script (`scripts/import-questions.js`, using `server/mockTests/questionImport.js`); there is no admin upload screen.
  - Answers can't yet be linked to students.

## 6. Website content module (implemented, provisional stack)

Owner decisions on 2026-10-29: JSON-file storage for the prototype (D4 still open for production), local-disk media (D5 still open), no image-processing dependency yet (resizing **[PENDING]**).

```
Admin › Website content (public/js/admin-content.js)
   │  GET  /api/admin/content            draft + published + image list
   │  PUT  /api/admin/content/draft      validate → save draft
   │  GET  /api/admin/content/preview    homepage rendered from the draft (admin only)
   │  POST /api/admin/content/publish    re-validate draft → copy to published
   │  POST /api/admin/content/discard    draft = published
   │  GET/POST /api/admin/media, GET /api/admin/media/:id/file, DELETE /api/admin/media/:id
   ▼
adminRouter (session check, same-origin check) → contentAdminRoutes.js
   ▼
contentRepository.js ── contentValidation.js         mediaLibrary.js (bytes-based type check, size and pixel limits)
   ▼                                                    ▼
data/runtime/site-content.json                       data/runtime/media.json + data/runtime/uploads/<uuid>.<ext>

Visitors: GET / → renderPage(published) in siteContent.js  ·  GET /media/:id → only images used by published banners
```

- **Draft / published:** visitors only see `published`. Publish re-validates the draft, so a banner pointing at a deleted image can't go live.
- **Rendering:** `public/index.html` has `<!--HERO-->` and `<!--TEXT:sections.<key>.<field>-->` placeholders. All values are HTML-escaped. The mock-test disclaimer is fixed in the template.
- **Uploads:** raw request body with an `image/jpeg|png|webp` content type, so no multipart parser (or new dependency) is needed. The type must match the file's bytes. There is a 5 MB / 6000 px limit and a 200-image library cap.
- **To move to a database later:** keep the `contentRepository` and `mediaLibrary` interfaces, and replace the JSON store and the local folder (e.g. Postgres + S3-compatible storage).
- **Known prototype limits:**
  - There is no change history.
  - EXIF metadata is not stripped.
  - There is a single admin role.
  - Writes from two admin tabs at once: the last save wins.

## 7. Non-functional targets

- Responsive and accessible (WCAG 2.1 AA).
- Chatbot responses streamed; timeout and graceful error message.
- Secrets supplied via environment variables only.
- See `security-checklist.md` for security requirements.
