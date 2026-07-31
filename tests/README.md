# Manual verification suites

End-to-end checks run against both servers as a batch gate. Proper automated tests (vitest +
supertest on the backend, Playwright on the frontend) arrive in Batch 15 — these exist so each
batch can be verified against a running system rather than assumed to work.

## Running

Both servers must be up:

```powershell
# terminal 1
cd backend;  npm run dev     # http://localhost:5000

# terminal 2
cd frontend; npm run dev     # http://localhost:3000

# terminal 3
powershell -File tests/auth-api.ps1
powershell -File tests/auth-frontend.ps1
```

## Suites

| File | Covers |
|---|---|
| `auth-api.ps1` | Registration, validation, session, login, CSRF, refresh rotation + reuse detection, password reset non-enumeration, password policy, health |
| `auth-frontend.ps1` | Public pages, middleware route guards, signed-out vs signed-in navbar, SSR session on the dashboard, auth-page bounce, verify-email states, 403 |
| `home-page.ps1` | All 13 landing sections, image optimisation, accessibility structure, CLS protection, SEO metadata and JSON-LD, newsletter endpoint incl. honeypot behaviour |
| `pets-listing.ps1` | Seeded dataset, every filter, combined filters, text search, **pagination stability across all sorts**, sort correctness, input hardening, SSR-driven shareable URLs, empty state |
| `pet-detail.ps1` | Detail DTO, view counting, similar-pets rules, 404 handling, page structure, gallery markup, adoption CTA, SEO metadata + JSON-LD, noindex on adopted pets, accessibility |
| `adoptions.ps1` | Answer validation, submission, **DB-enforced duplicate prevention**, role scoping, the status state machine, completion cascade (pet adopted + rival applications auto-rejected), withdraw and re-apply, own-shelter block |
| `adoptions-frontend.ps1` | Route protection, multi-step form rendering, unavailable-pet guard, applications list and detail, status timeline, success banner, already-applied handling, cross-user isolation |
| `dashboard.ps1` | Favourites API (idempotency, counters, scoping, CSRF), profile and preference updates, stats, account-deletion guards, all five dashboard pages, signed-out redirects, favourite state hydrating on the listing |
| `shelter.ps1` | Pet create/edit/delete, validation, role gates, **cross-shelter isolation attempted directly against the API**, status transitions, adoption cascade, applications inbox scoping, analytics, dashboard pages |
| `admin.ps1` | Access control for all admin routes, platform stats, user management, **role change invalidating a live session**, **last-admin protection**, suspension, pet moderation, shelter approval, **audit coverage and append-only enforcement**, CSRF, dashboard pages |
| `upload.ps1` | Upload config, signature auth + **folder allow-list** + role gating, CSRF, deletion scoping, **forged-publicId rejection**, URL fallback still saving, delete-with-cleanup, UI degradation |
| `notifications.ps1` | Access control, notification generation from real flows, per-user isolation, mark read / read-all, cross-user 404s, filtering, CSRF, deletion, admin-moderation notifications, bell visibility |

### Realtime (separate — not PowerShell)

PowerShell has no WebSocket client, so the socket gates are a Node script:

```powershell
cd backend
npx tsx src/scripts/realtime-check.ts
```

Covers handshake auth (anonymous and forged tokens rejected), **live delivery latency**, **room
isolation**, **offline persistence**, unread reconciliation, and cross-tab read propagation.
Expected: 13 checks, all passing, delivery well under 1s.

## Running the whole set

Set `DISABLE_RATE_LIMIT=true` in `backend/.env`, restart the backend, then:

```powershell
powershell -File tests/run-all.ps1
```

**Expected: 460 checks, 0 failed, 1 skipped.** The skip is the Cloudinary signature-shape check,
which needs real credentials in `backend/.env`. Realtime gates run separately — see below.

Suite order matters: `shelter` runs before `admin` (it seeds state the admin checks read), and both
run after the read-only suites.

The flag matters because the suites share the in-memory rate-limit budgets (10 logins per 15 min,
5 sensitive actions per hour). Without it the first few suites exhaust the quota and the rest skip
entirely rather than run. It is ignored in production — see the `!isProd` guard in
`middleware/rateLimit.ts`.

To verify rate limiting itself, unset the flag and run `auth-api.ps1` alone: the later password
policy cases will report `SKIP` on a 429, which is the limiter working.

## The stale-cache trap (fixed in Batch 7 — kept as history)

Reseeding used to mint brand-new ObjectIds on every backend restart, while Next kept pet lookups in
its **on-disk** cache (`.next/cache`, `revalidate: 300`) which survives a dev-server restart. Pages
then held pets whose ids no longer existed, so anything keyed on a pet id silently returned nothing
— looking exactly like a broken feature. It cost about an hour of debugging in Batch 6.

**The seed now assigns deterministic ObjectIds** (`stableId()` in `backend/src/scripts/seed.ts`), so
a reseed produces byte-identical ids and the cache stays valid. Clearing `.next` should no longer be
necessary.

If you ever see this shape of symptom again — a feature that works against the API directly but not
through a page, while SSR still renders signed-in chrome — suspect a cache holding stale ids and
clear `frontend\.next`.

## Gotchas

- **Rate limiting is the main source of confusing results.** `auth-api.ps1` spends most of the
  10-per-15-min registration budget, and the newsletter shares the 5-per-hour `sensitive` limiter
  with password reset — so running the data suites first can starve the auth suite and vice versa.
  Restarting the backend resets the in-memory store, and (while on the in-memory database) reseeds
  the data too, which is what you want between runs.
- **Windows PowerShell 5.1** has no `-SkipHttpErrorCheck`, so non-2xx responses throw. Both scripts
  wrap requests in try/catch and normalise the result; don't "simplify" that away.
- **React SSR markup.** React inserts `<!-- -->` between static text and an interpolated expression,
  so `Welcome back, <!-- -->Jane`. Assertions on rendered text must allow for it.
- Cookies ignore ports, so a session established against `:5000` is replayed against `:3000` by
  copying the cookies onto a second session object — that is what a real browser does.
- **`$home` is a reserved read-only PowerShell variable.** Assigning to it throws. Use `$homePage`.
- **A PowerShell function emits everything it writes, not just its `return` value.** So
  `if (Helper ...)` where `Helper` also calls `Write-Output` tests a non-empty array and is always
  truthy. Don't build check helpers that return booleans; branch on the response inline.
- Seed data is created on API boot when running the in-memory database, so restarting the backend
  resets both the dataset and the rate limiter.
- **Apostrophes in attributes are HTML-escaped.** `aria-label="View Pepper's photos"` renders as
  `View Pepper&#x27;s photos` — match around the apostrophe, not through it.
- These suites assert **markup and server behaviour only**. Nothing here clicks anything, so
  interactive behaviour (gallery lightbox, filter checkboxes, dropdowns) is not covered. Playwright
  fills that gap in Batch 15.
