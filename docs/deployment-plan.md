# Deployment Plan

> **Status: DRAFT.** Hosting provider, domains and pipeline are **[PENDING]** owner approval.
> No deployment to any environment happens without explicit owner sign-off.

## 1. Environments

| Environment | Purpose | Data | Hosting | Status |
|-------------|---------|------|---------|--------|
| Local | Development on developer machines | Placeholder / sample data only | Developer machine | Planned |
| Staging / preview | Owner review of the prototype | Sample data; no real user data | **[PENDING]** | **[PENDING]** |
| Production | Live website | Real content | **[PENDING]** | **Out of scope for prototype** |

## 2. Pending decisions

| # | Decision | Status |
|---|----------|--------|
| P1 | Hosting provider for staging (e.g. Vercel, Railway, Render, VPS) | **[PENDING]** |
| P2 | Domain / subdomain for staging | **[PENDING]** |
| P3 | Git hosting & repository visibility (private recommended) | **[PENDING]** |
| P4 | CI pipeline (e.g. GitHub Actions) | **[PENDING]** |
| P5 | Database and media hosting for staging | **[PENDING]** |
| P6 | Whether/when the prototype replaces the current site | **[PENDING]** |

## 3. Proposed release process (draft)

1. Work on a feature branch; never commit directly to the main branch.
2. Run lint, unit tests and end-to-end tests locally.
3. Open a pull request; CI runs the same checks plus a dependency audit.
4. Code review and owner approval.
5. Merge → automatic deploy to **staging only**.
6. Owner reviews staging against `requirements.md` and `security-checklist.md`.
7. Production deployment — **[PENDING]** separate plan and explicit approval.

## 4. Configuration

- All secrets set as environment variables in the hosting platform; never in the repo.
- `.env.example` documents required variable names with placeholder values.
- Staging uses its own AI key with a spending cap — **[PENDING]**.

## 5. Rollback

- Keep the previous staging deployment available for instant rollback — mechanism **[PENDING]** (depends on host).
- Database migrations must be reversible or backed up before applying.

## 6. Pre-deployment checklist

- [ ] All tests pass.
- [ ] `security-checklist.md` reviewed.
- [ ] No placeholder content is presented as real (questions, links, contact details).
- [ ] Owner approval recorded.
