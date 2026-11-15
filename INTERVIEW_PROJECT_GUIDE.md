# Shortly — Interview Project Guide

Use this as a cheat sheet while preparing. Speak in your own words; do not memorize word-for-word.

---

## 1. One-liner

**Shortly** is a full-stack URL shortener with JWT auth, custom aliases, scheduled go-live, destination safety checks, click analytics, and CSV/PDF reports.

---

## 2. Elevator pitch (≈45 seconds)

> I built Shortly, a Bitly-style URL shortener. Users register, create short links (random codes or custom aliases), optionally schedule when a link goes live, and track clicks.  
> The backend is Express + PostgreSQL with JWT auth and layered rate limiting. On every redirect I record geo, device, OS, browser, and referrer, and distinguish unique visitors with a hashed fingerprint.  
> I also built a destination safety engine that scores phishing/malware signals and can optionally call Google Safe Browsing, so unsafe destinations are blocked at create, edit, and redirect time.  
> The frontend is React + Vite with Dashboard, My Links (QR codes), Analytics, and exportable Reports.

---

## 3. Tech stack

| Layer | Choices |
|--------|---------|
| Client | React 19, Vite 8, `qrcode.react` |
| Server | Node.js, Express 5 (ES modules) |
| DB | PostgreSQL via `pg` Pool |
| Auth | bcrypt (hash), jsonwebtoken (JWT, 7d) |
| Limits | `express-rate-limit` |
| UA parse | `ua-parser-js` |
| Safety (optional) | Google Safe Browsing API |
| Geo (optional live) | `ip-api.com` |
| Config | `dotenv` |

**Why this stack (good interview answer):** familiar, interview-friendly, clear separation of concerns, SQL is easy to explain, JWT is a common auth pattern, and Vite keeps frontend setup light.

---

## 4. Repository layout

```
url-shortener/
├── client/                 # React UI (port 5173)
│   └── src/
│       ├── api.js          # fetch wrappers
│       ├── pages/          # Dashboard, MyLinks, Analytics, Reports
│       ├── components/     # Charts, SafetyReport
│       └── lib/            # helpers, CSV/PDF export
└── server/                 # Express API (port 3000)
    └── src/
        ├── index.js
        ├── db.js
        ├── routes/         # auth, links/analytics
        ├── controllers/
        ├── middleware/     # auth, rateLimit
        ├── utils/          # shortCode, urlCache, urlSafety, clickAnalytics
        └── sql/schema.sql
```

---

## 5. Core features (what to claim confidently)

### Auth
- Register / login
- Passwords hashed with bcrypt (cost factor 10)
- JWT returned on login; client stores token in `localStorage`
- Protected API routes use `Authorization: Bearer <token>`

### Short links
- Random 7-character alphanumeric codes
- Optional custom alias (3–64 chars, `[a-z0-9_-]`, reserved names blocked)
- Optional title (≤80 chars)
- Optional schedule (`activates_at`) and enable/disable
- Same user + same long URL reuses existing link (unless a custom alias is requested)
- Collision handling: retry insert up to 5 times on unique violation

### Redirect
- `GET /:code` → 302 to long URL
- Blocks: missing, expired, not yet active, disabled, blocked destination
- Auto-enables due scheduled links on list/redirect
- Click analytics recorded **after** redirect (non-blocking)

### Safety
- Local heuristic engine (risk score + indicators)
- Categories: suspicious URL shape, domain reputation, phishing, known malicious
- Verdicts: `allow` / `warn` / `block`
- Optional Google Safe Browsing enrichment
- Live preview while typing on My Links
- Hard block on create/edit/redirect when verdict is `block`

### Analytics
- Total + unique clicks
- Country, city, device, OS, browser, referrer source
- Clicks by day and by hour (UTC)
- Account overview + per-link deep dive
- Recent click feed

### Reports
- Date range + optional link filter
- Summary totals
- CSV export (client-side)
- Lightweight PDF export (client-generated)
- Caps at 5000 click rows (`truncated: true` if more)

### UX extras
- QR code per short link + PNG download
- Light/dark theme
- Link filters: All / Active / Scheduled / Disabled
- Search + sort on My Links

---

## 6. API map

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/register` | No | Create account |
| POST | `/api/login` | No | Get JWT |
| GET | `/api/me` | Yes | Verify session |
| POST | `/api/safety` | Yes | Inspect destination without shortening |
| POST | `/api/shorten` | Yes | Create / reuse short link |
| GET | `/api/links` | Yes | List my links |
| PATCH | `/api/links/:id` | Yes | Update destination / title / schedule / enabled |
| GET | `/api/analytics/overview` | Yes | Account-wide analytics |
| GET | `/api/links/:id/analytics` | Yes | Per-link analytics |
| GET | `/api/reports` | Yes | Date-range report (`from`, `to`, `linkId`) |
| GET | `/:code` | No | Redirect + record click |

---

## 7. Database model

### `users`
- `id`, `email` (unique), `password_hash`, `created_at`

### `links`
- `short_code` (unique, global)
- `long_url`, `user_id` (FK, cascade delete)
- `click_count`, `unique_click_count`
- `title`, `enabled`, `activates_at`, `expires_at`, `created_at`
- Index on `(user_id, long_url)` for reuse lookups

### `link_clicks`
- One row per redirect event
- `visitor_hash`, `is_unique`
- `country`, `city`, `device`, `os`, `browser`
- `referrer`, `referrer_source`
- Indexes on `link_id`, `(link_id, clicked_at)`, `(link_id, visitor_hash)`

**Ownership rule:** every mutating/analytics query filters by `user_id` from the JWT.

---

## 8. Important flows (explain these clearly)

### A. Create short link
1. Client sends `longUrl` (+ optional alias/title/schedule) with JWT.
2. Rate limiters check IP + user hourly/daily budgets.
3. Validate URL protocol (`http`/`https`).
4. Run `inspectUrl`; if `block` → **403**.
5. If no custom alias and same URL already exists for user → return existing (**200**, `cached: true`).
6. Else insert random code (retry on collision) or custom alias (**201** / **409** if taken).
7. Update in-memory reuse cache.

### B. Redirect
1. Look up `short_code`.
2. Reject reserved names, missing, expired, not-yet-active, disabled.
3. If schedule due and disabled → auto-enable.
4. Re-check destination safety; block if malicious/phishing.
5. `res.redirect(long_url)`.
6. Async: `recordLinkClick` (geo + UA + unique flag + counters) inside a DB transaction.

### C. Unique visitor
- Hash = `sha256(ip + '|' + userAgent).slice(0, 32)`
- First time that hash appears for a link → `is_unique = true` and `unique_click_count += 1`
- Later clicks still increment `click_count` only

### D. Safety scoring (high-signal talking point)
Signals include:
- known bad domains / env blocklist
- userinfo/`@` host tricks
- raw IP hosts, abused TLDs, punycode, homoglyphs
- random-looking domains (entropy + low vowel ratio)
- nested shorteners, risky file extensions
- phishing keywords + brand lookalikes (Levenshtein / embedded brand names)
- sensitive query params, open-redirect style params
- optional Safe Browsing threat match → force block

Verdict:
- `block` if high confidence / score ≥ 72 / known malicious / brand impersonation rules
- `warn` if indicators but not blocked
- `allow` if clean

---

## 9. Rate limiting (numbers to remember)

Configurable via env; defaults:

| Limiter | Default |
|---------|---------|
| Public IP | 300 / min |
| Login (IP + account) | 10 failed / 15 min (`skipSuccessfulRequests`) |
| Register IP | 5 / hour |
| Shorten IP | 40 / hour |
| Shorten per user | 30 / hour, 100 / day |
| Redirect IP | 120 / min |

`app.set('trust proxy', 1)` so client IP is correct behind proxies (needed for geo + limits).

---

## 10. Caching — be honest about tradeoffs

**What it is:** process-local `Map` keyed by `userId:longUrl` to speed “already shortened?” lookups.

**Strengths:** simple, zero infra, helps repeated shorten of the same URL.

**Limits (say this):**
- Not shared across multiple Node processes
- Lost on restart
- Cache hit still re-reads DB for fresh click counts
- Production scale would use Redis (or skip and rely on the DB index)

---

## 11. Security story (strong interview section)

Already implemented:
- Password hashing (bcrypt)
- JWT-protected write/read routes
- Ownership checks on update/analytics
- Rate limits on auth, shorten, redirect
- Vague login errors (no email enumeration)
- URL allowlist to `http`/`https` only
- Destination phishing/malware screening
- Reserved aliases / path collision avoidance
- Parameterized SQL (no string-built queries)
- Visitor privacy via hashed fingerprint (not raw IP stored in clicks table)

Known gaps / next steps (shows maturity):
- JWT in `localStorage` is XSS-sensitive → prefer httpOnly cookies later
- No refresh-token / server-side revocation list yet
- In-memory rate limits don’t sync across instances → Redis store
- `disposable-email-domains` is in dependencies but not wired in yet
- No email verification / password reset
- CORS is open for local/dev; tighten origins in production
- Geo uses a public HTTP API; production may want a paid/private provider

---

## 12. Frontend structure

| Page | Job |
|------|-----|
| Auth | Login / register, theme toggle |
| Dashboard | Totals, 14-day chart, top links, country/device/source, recent clicks |
| My Links | Create link, safety preview, QR, edit destination/title/schedule, enable/disable, filters |
| Analytics | All-links or one-link breakdowns, day/hour charts |
| Reports | Date range filter, preview table, CSV/PDF download |

Auth token keys: `shortly_token`, `shortly_email`, `shortly_theme`.

---

## 13. Design decisions & how to defend them

| Decision | Why |
|----------|-----|
| Postgres for links + clicks | Durable, relational ownership, easy aggregations |
| Fire-and-forget click write after redirect | Redirect latency stays low for end users |
| Safety on redirect too | Destination could turn malicious after creation |
| Global unique `short_code` | Short URLs must resolve without knowing the owner |
| Reuse same long URL per user | Avoids duplicate clutter; custom alias still creates a new mapping |
| Client-side CSV/PDF | No extra server load; enough for interview/demo scale |
| Heuristic safety + optional GSB | Works offline/local without API keys; stronger when key is set |

---

## 14. Scaling answer (if asked “what next?”)

1. Put redirects behind a fast path; cache `short_code → long_url` in Redis with TTL.
2. Move rate-limit store to Redis.
3. Write click events to a queue (e.g. Redis stream / Kafka) and flush asynchronously.
4. Separate “redirect service” from “dashboard API” if traffic grows.
5. Add CDN / edge redirects for global latency.
6. Paginate links/clicks; archive old click rows.
7. Add tests: safety unit tests, auth integration tests, redirect e2e.

---

## 15. Setup (if they ask how to run it)

1. Create Postgres DB `url_shortener`, apply `server/src/sql/schema.sql`.
2. `server/.env`: `DATABASE_URL`, `PORT`, `JWT_SECRET` (+ optional `GOOGLE_SAFE_BROWSING_API_KEY`, `BLOCKED_DOMAINS`, rate-limit envs).
3. `cd server && npm install && npm run dev` → `:3000`
4. `cd client && npm install && npm run dev` → `:5173`
5. Optional client env: `VITE_API_URL`

---

## 16. Suggested demo script (3–4 minutes)

1. Register / login.
2. Paste a normal URL → show safety “Clear/Flagged”.
3. Create with custom alias + title + schedule.
4. Open short link → show redirect.
5. Dashboard / Analytics update (country may be empty on localhost).
6. Toggle disable → redirect blocked.
7. Try a phishing-looking URL → blocked with indicators.
8. Reports → export CSV.

---

## 17. STAR stories you can prepare

### Story A — Safety engine
- **Situation:** Shorteners are often abused for phishing.
- **Task:** Stop users from creating (and serving) dangerous destinations.
- **Action:** Built multi-signal local inspector + optional Safe Browsing; wired into create/edit/redirect and live UI preview.
- **Result:** High-confidence phishing/malware destinations are blocked with explainable indicators.

### Story B — Non-blocking analytics
- **Situation:** Redirect path must stay fast.
- **Task:** Capture rich click metadata without delaying users.
- **Action:** Redirect first; record click in background with transaction updating totals + unique flag.
- **Result:** Users get immediate redirects; dashboard still gets geo/device/referrer breakdowns.

### Story C — Abuse controls
- **Situation:** Public shorten + login endpoints attract bots.
- **Task:** Limit spam without hurting normal users.
- **Action:** Layered IP/user rate limits; login limits only count failures; per-account + per-IP login caps.
- **Result:** Harder to brute-force passwords or mass-create links from one network.

---

## 18. Honest “weak spots” (good to volunteer)

- No automated test suite yet (`npm test` is a stub on the server).
- In-memory cache/rate limits are single-process.
- README API table is slightly behind newer endpoints (safety, analytics, reports, PATCH).
- Localhost analytics often lack country/city (private IP skipped).
- PDF export is a minimal custom generator, not a full reporting suite.

Framing: “I prioritized a working product with real security and analytics depth; tests and horizontal scaling are the next hardening steps.”

---

## 19. Glossary (quick recall)

- **Short code / alias:** public path segment that maps to a long URL
- **JWT:** signed token proving who is logged in
- **Unique click:** first seen visitor hash for that link
- **Verdict:** safety decision (`allow` / `warn` / `block`)
- **Homoglyph:** lookalike character used to spoof brands
- **Fire-and-forget:** start async work without awaiting before responding

---

## 20. Closing line

> Shortly shows I can own a full-stack feature set end-to-end — auth, data modeling, abuse controls, a non-trivial safety system, and product analytics — not just a CRUD demo.
