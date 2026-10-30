# Proposed Sitemap

> **Status: DRAFT.** Page list is a proposal and is **[PENDING]** owner approval.
> It is not based on a verified audit of the current site (see `website-audit.md`).

## Public pages

```
/                         Home — hero banners, highlights, mock-test CTA, social links
├── /about                About MyPlanetFinance              [content PENDING from owner]
├── /courses              Courses / services overview        [PENDING — confirm offerings]
├── /mock-tests           Mock-test landing page
│   ├── /mock-tests/ap-icet         AP ICET test list
│   │   └── /mock-tests/ap-icet/:testId          Test player
│   │       └── /mock-tests/ap-icet/:testId/result   Result & explanations
│   └── /mock-tests/ts-icet         Telangana ICET test list
│       └── /mock-tests/ts-icet/:testId          Test player
│           └── /mock-tests/ts-icet/:testId/result   Result & explanations
├── /contact              Contact form                        [contact details PENDING]
├── /privacy              Privacy policy                      [PENDING — legal text from owner]
└── /terms                Terms of use / disclaimer           [PENDING — legal text from owner]
```

Global elements on every public page: header navigation, footer with LinkedIn/Instagram links, chatbot launcher.

## Student account pages — [PENDING: decide whether login is required]

```
/login
/register
/my-results
```

## Admin pages (not linked publicly, auth required)

```
/admin/login
/admin                    Dashboard
├── /admin/banners        Banner / hero slides
├── /admin/pages          Headings & text blocks per page
├── /admin/media          Image library
├── /admin/mock-tests     Tests & question banks (AP ICET / TS ICET)
├── /admin/social-links   LinkedIn / Instagram URLs
├── /admin/chatbot        Welcome message & quick replies
└── /admin/users          Admin users & roles   [PENDING — roles decision]
```

## Open items

- Final page names and URL slugs — **[PENDING]**.
- Whether `/courses` exists on the current site and should be retained — **[PENDING — UNVERIFIED]**.
- Redirects from existing URLs — **[PENDING]** (requires audit).
