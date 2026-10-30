# Security Checklist

> Use before each review and before any deployment. Items depending on undecided technology are marked **[PENDING]**.

## Secrets and configuration
- [ ] No API keys, passwords, tokens or credentials in source code, docs, commits or screenshots.
- [ ] `.env` files are git-ignored; only `.env.example` with placeholder values is committed.
- [ ] Separate keys for development and production; production keys never used locally.
- [ ] AI provider key used server-side only; never exposed to the browser.

## Authentication and authorisation (admin)
- [ ] Passwords hashed with a modern algorithm (bcrypt / argon2).
- [ ] Login rate limiting / lockout after repeated failures.
- [ ] Secure, HttpOnly, SameSite session cookies.
- [ ] Every admin API endpoint checks authentication and role server-side.
- [ ] No default admin credentials shipped; first admin created via a secure setup step.
- [ ] Multi-factor authentication for admins — **[PENDING]**.

## Input handling
- [ ] All inputs validated server-side (type, length, format).
- [ ] Output encoding / sanitisation for admin-edited rich text to prevent XSS.
- [ ] Parameterised queries / ORM to prevent SQL injection.
- [ ] CSRF protection on state-changing requests.

## File uploads
- [ ] Allow-list of image types (e.g. JPEG, PNG, WebP); reject SVG unless sanitised.
- [ ] Maximum file size enforced.
- [ ] Files renamed on upload; stored outside executable paths.
- [ ] Images re-encoded / stripped of metadata. **[PENDING]**: needs an image-processing dependency. The prototype validates the bytes, size and dimensions only.

## Chatbot
- [ ] Per-IP / per-session rate limiting and maximum message length.
- [ ] System prompt restricts the bot to approved topics; resists prompt-injection attempts.
- [ ] Bot does not reveal system prompt, keys or internal data.
- [ ] No personal data stored without approved consent and retention policy — **[PENDING]**.
- [ ] Spending cap / usage alerts configured with AI provider — **[PENDING]**.

## Mock tests
- [ ] Correct answers not sent to the browser before submission.
- [ ] Timer and scoring enforced server-side.

## Transport and headers
- [ ] HTTPS everywhere; HSTS enabled in production.
- [ ] Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame-ancestors set.
- [ ] External links use `rel="noopener noreferrer"`.

## Dependencies and operations
- [ ] Dependency vulnerability scan (e.g. `npm audit` or equivalent) passes — tool **[PENDING]**.
- [ ] Lockfile committed.
- [ ] Error pages do not leak stack traces in production.
- [ ] Logs exclude passwords, tokens and personal data.
- [ ] Database backups and restore tested — **[PENDING]**.

## Privacy and legal
- [ ] Privacy policy and terms supplied by owner — **[PENDING]**.
- [ ] Mock-test disclaimer: not affiliated with official exam authorities.
- [ ] Chatbot disclaimer: AI-generated, may be inaccurate, not financial/admissions advice.
