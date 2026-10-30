# CLAUDE.md — MyPlanetFinance Website Enhancement Prototype

## Project objectives

Build a locally runnable prototype of an enhanced MyPlanetFinance website with:

1. A Messenger-style AI chatbot.
2. LinkedIn and Instagram links (official URLs supplied by the owner).
3. AP ICET and Telangana ICET mock-test modules.
4. Admin customisation of banners, images, headings and text.
5. A responsive design inspired by the general layout of ibsat.org.

Source of truth: `requirements.md`. Supporting docs: `docs/`.

## Current phase

**Local prototype: AI messenger only.** The owner requested the chatbot on 2026-10-29. It runs on a **provisional** stack (Node.js + Express, plain HTML/CSS/JS, `node:test` + jsdom) pending stack decision D1–D12. Build other features only when the owner asks, and do not connect a live AI provider until one is approved (D6).

Commands: `npm install`, `npm start` (http://127.0.0.1:3000), `npm test`.

## Development rules

- Read `requirements.md` and the relevant `docs/` file before starting a task.
- Keep changes small and focused; one feature or fix per branch/PR.
- Never commit directly to the main branch. Never commit or push without explicit owner instruction.
- Keep all configurable content (banners, text, social links, exam patterns, questions) in data/admin — not hard-coded.
- Follow the stack, conventions and folder layout once approved; do not introduce new frameworks or major dependencies without approval.
- Update docs when behaviour or architecture changes.
- Mark anything unverified or undecided as **[PENDING]** rather than guessing.

## Testing requirements

- Every feature includes automated tests (unit + integration; end-to-end for user flows such as taking a mock test, admin editing a banner, and opening the chatbot).
- Tests must pass locally before a change is proposed for review.
- Test responsive layouts at ~360px, 768px, 1024px and 1440px.
- Check accessibility (keyboard navigation, labels, contrast) for new UI.
- Tests use placeholder data and mocked AI responses — never call real AI APIs or production services in tests.
- Report test results honestly, including failures and skipped tests.

Test tooling (provisional): Node's built-in test runner (`npm test`), with jsdom for UI tests. Final choice is D12 in `docs/technical-architecture.md`.

## Safety constraints

- **Do not** access private source code, production servers, production databases or production admin panels.
- **Do not** invent official social-media URLs, examination questions, exam patterns, credentials, contact details, prices, or any other business details. Use obvious placeholders and mark them **[PENDING]**.
- **Do not** copy text, images, logos, colours or code from ibsat.org or any other site; take general layout inspiration only.
- **Do not** place secrets in code, docs, commits or logs. Use environment variables and `.env.example` placeholders.
- **Do not** deploy to any environment without explicit owner approval.
- **Do not** store personal data (chat logs, student details) until a privacy policy and retention rule are approved.
- AI chatbot must be labelled as AI, carry a disclaimer, and be restricted to approved topics.
- Mock tests must carry a "not affiliated with official exam authorities" disclaimer.
- Follow `docs/security-checklist.md` for every feature.
