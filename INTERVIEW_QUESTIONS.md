# Shortly — Interview Questions & Answers

Practice out loud. Lead with **why**, then **how** it works in this repo. Answers below are model responses — paraphrase them in your own words.

---

## 1. Elevator / Project Overview

### 1. Walk me through this project in 60 seconds.

**Answer:** Shortly is a full-stack URL shortener. Users register with JWT auth, create short links (random codes or custom aliases), optionally schedule when a link goes live, and track clicks. The backend is Express + PostgreSQL; the frontend is React + Vite. Beyond basic shortening I built destination safety checks for phishing/malware, layered rate limiting, unique-visitor analytics with geo/device/referrer breakdowns, and CSV/PDF reports.

### 2. What problem does Shortly solve, and who is it for?

**Answer:** Long URLs are hard to share and you get no insight into who clicked them. Shortly gives individuals or small teams branded/short links, control (enable/disable/schedule), safety screening so they don’t accidentally share malicious destinations, and analytics to see what performs.

### 3. What is the tech stack, and why did you choose it?

**Answer:** React + Vite on the client; Node/Express, PostgreSQL (`pg`), bcrypt, JWT, express-rate-limit, ua-parser-js on the server. I chose it because it’s interview-friendly, keeps client/API concerns separate, SQL makes ownership and aggregations clear, and JWT + bcrypt are industry-standard auth building blocks.

### 4. What would you demo first to an interviewer?

**Answer:** Create a link with a custom alias and title → open the short URL → show Dashboard/Analytics updating → disable the link and show redirect blocked → paste a phishing-looking URL and show the safety block with indicators → export a report as CSV.

### 5. What is the most complex feature you built here?

**Answer:** The destination safety engine. It combines URL-shape heuristics, reputation signals, brand lookalike/phishing detection (homoglyphs, Levenshtein), a local blocklist, and optional Google Safe Browsing — then returns an explainable verdict used on create, edit, and redirect.

### 6. What would you improve if you had one more week?

**Answer:** Automated tests (safety unit tests + auth/redirect integration), Redis for shared rate limits and short-code cache, httpOnly cookie auth instead of localStorage JWT, pagination for large click histories, and wiring disposable-email blocking on register.

---

## 2. Architecture & System Design

### 7. Draw the high-level architecture (client → API → DB → external services).

**Answer:**
```
Browser (React/Vite)
    │  REST + JWT
    ▼
Express API
    ├── Auth / Links / Analytics / Reports
    ├── Redirect GET /:code
    ├── PostgreSQL (users, links, link_clicks)
    ├── In-memory Map cache (reuse lookups)
    ├── ip-api.com (geo, async on click)
    └── Google Safe Browsing (optional, on inspect)
```

### 8. Why is the app split into `client` and `server`?

**Answer:** Separation of concerns — UI can iterate independently of API/DB. The API is reusable (other clients could call it). Redirects and auth stay server-side where secrets and validation belong. Vite/React handle a rich dashboard that a pure server-rendered page would make clumsier.

### 9. How does a request flow when a user creates a short link?

**Answer:** Client `POST /api/shorten` with Bearer token → public/IP/user rate limits → `requireAuth` → validate URL → `inspectUrl` (block if unsafe) → if no custom alias, check cache/DB for existing same long URL for that user and reuse → else insert random code (retry on collision) or custom alias → return `201` (new) or `200` (reused) with link + safety.

### 10. How does a request flow when someone opens `/:code`?

**Answer:** Rate limit → look up `short_code` → reject reserved/missing/expired/not-active/disabled → maybe auto-enable if schedule is due → safety-check destination → `302` redirect → fire-and-forget `recordLinkClick` (hash visitor, geo, UA, update counters in a transaction).

### 11. Why is redirect handled on the same server as the API instead of a separate service?

**Answer:** For this project size, one Express app is simpler to deploy and reason about. Redirect and dashboard share the same DB and safety utils. At real scale I’d split a thin redirect service, but that complexity wasn’t justified for the current stage.

### 12. How would you scale this if traffic grew 100x?

**Answer:** Cache `short_code → long_url` in Redis; move rate limits to Redis; queue click writes asynchronously; run multiple API/redirect instances behind a load balancer; paginate/archive old clicks; optionally push redirects to the edge/CDN; keep Postgres for source of truth with read replicas for analytics.

### 13. Where are the bottlenecks today (DB, redirects, geo lookup, Safe Browsing)?

**Answer:** Redirect path does a DB lookup every time (no Redis). Safety on redirect can call Safe Browsing (bounded by timeout). Geo is async after redirect so it doesn’t block users, but click writes + transactions can pressure Postgres under heavy click volume. In-memory rate limits/cache don’t help across multiple processes.

### 14. Why use PostgreSQL instead of Redis or MongoDB for short links?

**Answer:** Links have clear relational ownership (user → links → clicks), need unique constraints, joins for analytics, and durable storage. Redis is great as a cache/layer, not as the only source of truth. Mongo would work but SQL aggregations and FKs fit this domain cleanly.

### 15. What would you put in Redis if you redesigned caching?

**Answer:** (1) `short_code → { long_url, enabled, activates_at, expires_at }` for fast redirects, (2) rate-limit counters, (3) optionally recent “userId+longUrl → link id” reuse lookups. Keep Postgres authoritative; Redis is a performance layer with TTL/invalidation on updates.

---

## 3. Authentication & Authorization

### 16. How does registration work end-to-end?

**Answer:** Client posts `{ email, password }` to `/api/register` (rate-limited). Server validates presence, bcrypt-hashes password (10 rounds), inserts into `users`. Unique email violation (`23505`) → 409. Client then logs in to receive a JWT. UI requires password min length 6.

### 17. Why hash passwords with bcrypt? What are salt rounds?

**Answer:** Never store plaintext. bcrypt is slow by design (resists brute force) and salts automatically so identical passwords don’t share hashes. Salt rounds (cost factor 10 here) control work factor — higher is safer but slower. On login we `bcrypt.compare` the candidate against the stored hash.

### 18. How does JWT auth work in this project?

**Answer:** On successful login the server signs a JWT with `JWT_SECRET`. The client stores it and sends `Authorization: Bearer <token>` on protected calls. `requireAuth` verifies the signature/expiry and attaches `{ userId, email }` to `req.user`. No server session store — it’s stateless.

### 19. What claims are inside the token, and how long does it live?

**Answer:** Payload includes `userId` and `email`, signed with HS256-style secret via `jsonwebtoken`. Expiry is **7 days** (`expiresIn: '7d'`).

### 20. How does `requireAuth` protect routes?

**Answer:** Middleware checks for `Authorization: Bearer …`, verifies with `jwt.verify`, sets `req.user`, calls `next()`. Missing/invalid/expired token → 401. Applied to shorten, links, safety, analytics, reports, me — not to public redirect.

### 21. Why return a vague “Invalid email or password” on login failure?

**Answer:** To avoid email enumeration. If we said “email not found” vs “wrong password,” attackers learn which emails are registered. Same message for both missing user and bad password.

### 22. Where is the JWT stored on the client, and what are the tradeoffs vs httpOnly cookies?

**Answer:** Stored in `localStorage` (`shortly_token`). Easy for a SPA, but any XSS can steal it. httpOnly Secure cookies aren’t readable by JS and are safer against XSS, but need CSRF protections and careful SameSite/CORS setup. I’d move to cookies for production hardening.

### 23. How do you prevent one user from updating another user’s link?

**Answer:** Updates/analytics always include `WHERE id = $linkId AND user_id = $req.user.userId`. If no row matches → 404. The JWT’s `userId` is the only identity we trust, not a client-supplied owner id.

### 24. What happens if `JWT_SECRET` is weak or missing?

**Answer:** Missing/weak secret means tokens can be forged or verification fails unpredictably. Attackers could mint tokens for any `userId`. It must be a long random secret in `.env`, never committed, rotated if leaked.

### 25. How would you add refresh tokens or logout/token revocation?

**Answer:** Issue short-lived access JWTs + longer-lived refresh tokens stored hashed in DB (or Redis). Logout deletes/blacklists the refresh token. Optionally maintain a JWT denylist keyed by `jti` until expiry. Stateless access tokens alone can’t be revoked early without a denylist or short TTL.

---

## 4. URL Shortening Core

### 26. How is a random short code generated?

**Answer:** `generateShortCode(length=7)` picks 7 chars from `A–Z a–z 0–9` (~62^7 space) using `Math.random`. Good enough for a project; production might use crypto-strong randomness.

### 27. What is the collision strategy if two inserts get the same `short_code`?

**Answer:** Insert relies on the DB unique constraint. On Postgres `23505`, we retry with a new code, up to 5 attempts. If still colliding → 500 “Could not generate a unique short code.”

### 28. How do custom aliases work, and what validation rules apply?

**Answer:** Optional `customAlias` is trimmed/lowercased. Must be 3–64 chars, match `^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$`, and not be reserved. Inserted as `short_code`. Duplicate → 409 “alias already taken.”

### 29. Why are some aliases reserved (`api`, `login`, `me`, etc.)?

**Answer:** Those path segments collide with real API/app routes. If someone owned `/api` as a short code, routing would break or become ambiguous. Reserved sets in alias validation and redirect guard both protect this.

### 30. Why reuse an existing link when the same user shortens the same long URL again?

**Answer:** Avoids duplicate rows and clutter for the same destination. We look up by `(user_id, long_url)` (cache then DB), skip expired ones, and return the existing link with `cached: true`. Optionally updates `activates_at` if provided.

### 31. When does reuse **not** happen (custom alias case)?

**Answer:** If the user requests a custom alias, we always attempt a new insert for that alias — reuse would defeat the purpose of creating a second public path to the same URL.

### 32. What optional fields can be set when creating a link (title, schedule, enabled, alias)?

**Answer:** `title` (≤80), `activatesAt` (ISO date or empty), `enabled` (default true; false if explicitly false), `customAlias`. `longUrl` is required.

### 33. How do you validate that `longUrl` is a real `http`/`https` URL?

**Answer:** `new URL(value)` must succeed and protocol must be `http:` or `https:` — blocks javascript:, data:, etc. Then safety inspection runs on top of that.

### 34. What HTTP status codes do you return for create success vs reuse (`201` vs `200`)?

**Answer:** **201 Created** for a newly inserted link. **200 OK** when returning an existing reused link. **409** for taken alias/email. **403** for blocked destination. **400** for validation errors.

---

## 5. Redirect Logic & Link Lifecycle

### 35. What checks happen before redirecting a visitor?

**Answer:** Reserved code check → exists? → not expired? → not before `activates_at`? → auto-enable if due → `enabled`? → destination safety not `block`? → then redirect.

### 36. Difference between `enabled`, `activates_at`, and `expires_at`?

**Answer:**
- **`enabled`:** manual on/off switch.
- **`activates_at`:** earliest time the link should work / auto-enable.
- **`expires_at`:** after this, treated as gone (404). Can be null (no expiry).

### 37. What happens if someone clicks a link before `activates_at`?

**Answer:** **403** with message “This link is not active yet” and the `activatesAt` timestamp. No redirect, no click recorded as a successful visit path.

### 38. What happens if a disabled link’s schedule becomes due?

**Answer:** On list (`enableDueLinks` for user) or redirect, if `enabled = false` and `activates_at <= NOW()`, we set `enabled = true`. Then redirect can proceed (if otherwise valid).

### 39. Why clear `activates_at` when a user manually disables an already-due link?

**Answer:** Otherwise the next list/redirect would auto-re-enable it because the schedule is still “due.” Clearing a past `activates_at` on manual disable makes the disable stick.

### 40. Why return 404 for expired links instead of a distinct “expired” message?

**Answer:** Avoid leaking whether a code ever existed vs expired (info disclosure). Callers just see “not found.” (Not-yet-active uses 403 because that’s a different product state for scheduled links.)

### 41. Why is click recording done **after** `res.redirect`, fire-and-forget?

**Answer:** End users care about redirect speed. Geo lookup and DB writes shouldn’t delay them. We redirect first, then `recordLinkClick(...).catch(...)` so analytics failures don’t break the redirect.

### 42. How do you stop reserved path names from being treated as short codes?

**Answer:** In `redirectToLongUrl`, if `code` is in a reserved list (`api`, `login`, `me`, `analytics`, …) return 404 immediately. Alias normalization also rejects those names at create time.

---

## 6. Caching

### 43. What does the in-memory URL cache store, and what is the key?

**Answer:** A process-local `Map` from `` `${userId}:${longUrl}` `` → link row. Speeds “did this user already shorten this URL?” lookups during create.

### 44. Why re-read `click_count` from the DB even on a cache hit?

**Answer:** Cached rows can be stale for counters that change on every redirect. Cache proves the mapping exists; we still `SELECT` by id for fresh counts (and expiry check) before returning.

### 45. What are the limitations of a process-local `Map` cache?

**Answer:** Not shared across instances, lost on restart, no TTL/eviction policy, unbounded growth risk, inconsistent under multi-process deploy. Fine for a single-node demo, not for horizontal scale.

### 46. What happens to the cache when a link destination is updated?

**Answer:** On long URL change we `deleteCachedLink` for the old URL and `setCachedLink` for the new one so reuse lookups stay correct.

### 47. Would this cache work correctly with multiple server instances? Why/why not?

**Answer:** No — each Node process has its own Map. Instance A won’t see B’s cache entries; invalidations won’t propagate. Use Redis (or skip and rely on the DB index) for multi-instance correctness.

---

## 7. URL Safety / Phishing Detection (High-Value Topic)

### 48. Explain the destination safety system at a high level.

**Answer:** `inspectUrl` runs local heuristics that accumulate a risk score and indicator list, producing `allow` / `warn` / `block`. Optionally queries Google Safe Browsing; a match forces block. Used before create/edit and again on redirect, plus a live preview endpoint for the UI.

### 49. What are the four signal categories (suspicious, reputation, phishing, malicious)?

**Answer:**
- **Suspicious:** weird shape (IP host, deep subdomains, encoding tricks, nested shorteners, risky extensions).
- **Reputation:** abused TLDs, random-looking domains, weak trust signals.
- **Phishing:** brand impersonation, login bait words, sensitive params, homoglyphs.
- **Malicious:** known blocklist / Safe Browsing threat match.

### 50. What do verdicts `allow` / `warn` / `block` mean?

**Answer:** **allow** — no meaningful indicators. **warn** — allowed but flagged for review (UI shows indicators). **block** — hard reject with 403; won’t create/update/redirect.

### 51. How is the risk score calculated, and when does it force a block?

**Answer:** Weighted points per indicator, clamped 0–100. Immediate/forced block for known bad hosts, username `@` tricks, strong brand impersonation, IP+login bait, risk ≥ 72, or Safe Browsing hit. Reputation labels derive from score/block state (`clean` / `unknown` / `low` / `malicious`).

### 52. How do you detect brand lookalikes (PayPal, Apple, etc.)?

**Answer:** Maintain brand → official domains map. If host isn’t official, check labels for exact brand, Levenshtein distance 1 with digit/confusable cues, or brand embedded with phishing keywords. High-confidence cases set `block`.

### 53. What is Levenshtein distance doing in the phishing checks?

**Answer:** Measures edit distance between a domain label and a brand name. Distance exactly 1 (e.g. `paypa1`≈`paypal`) suggests typosquatting, especially with digits/confusables. We short-circuit if length differs by >1 for speed.

### 54. What are confusables / homoglyphs, and why do they matter?

**Answer:** Characters that look alike (Cyrillic `а` vs Latin `a`, `0` vs `o`). Phishers register lookalike domains. We fold confusables to ASCII-ish forms and flag hosts mixing lookalike chars.

### 55. What is Shannon entropy used for (`looksRandom`)?

**Answer:** High entropy + low vowel ratio on long labels suggests DGA/machine-generated domains often used in malware campaigns. That raises reputation risk (doesn’t always block alone).

### 56. Why block nested shorteners (bit.ly → …)?

**Answer:** Nested shorteners hide the final destination and are a common abuse pattern. We add risk when the destination registrable domain is itself a known shortener so users can’t launder a bad URL through another shortener.

### 57. How does Google Safe Browsing integrate, and what if the API key is missing?

**Answer:** If `GOOGLE_SAFE_BROWSING_API_KEY` is set, we POST the URL to the threatMatches API (2.5s timeout). A match forces risk 100 / block / malicious. If no key or the call fails, we rely on local heuristics only — the app still runs.

### 58. Why run safety checks on create, edit, **and** redirect?

**Answer:** Create/edit stop bad links entering the system. Redirect re-checks because a destination can turn malicious later, or reputation feeds/lists can update. Defense in depth for anyone still holding an old short URL.

### 59. How does the live “check as you type” safety preview work on the client?

**Answer:** On My Links, typing `longUrl` debounces ~400ms then `POST /api/safety`. Response renders in `SafetyReport` (verdict, risk, grouped indicators) without creating a link yet.

### 60. What would you improve next in the safety engine?

**Answer:** Cache Safe Browsing results, add unit tests with known-good/bad fixtures, sync blocklists periodically, resolve nested shorteners (follow redirects carefully), reduce false positives on legitimate brand subdomains, and add admin override/audit logs.

---

## 8. Analytics & Unique Visitors

### 61. What data do you capture on each click?

**Answer:** Timestamp, visitor hash, unique flag, country, city, device, OS, browser, full referrer, referrer source — stored in `link_clicks`, plus increments on the parent `links` counters.

### 62. How do you define a unique visitor?

**Answer:** First time we see a given `visitor_hash` for that `link_id`. Hash = SHA-256 of `ip|userAgent`, truncated to 32 hex chars. Later same hash → not unique. It’s **once forever per link**, not per day.

### 63. Why hash IP + User-Agent instead of storing raw IPs?

**Answer:** Privacy minimization — we can still approximate uniqueness without retaining raw IPs in the clicks table. Hashing also avoids casually exposing PII in exports/UI. (Note: IP is still used briefly for geo lookup at request time.)

### 64. How do geo lookups work (`ip-api.com`), and what about private IPs?

**Answer:** After redirect, `lookupGeo(ip)` calls ip-api with a 1.5s abort timeout. Private/local IPs (`127.0.0.1`, `10.x`, `192.168.x`, etc.) skip the API and return null country/city — so localhost demos often show empty geo.

### 65. How do device / OS / browser get parsed?

**Answer:** `ua-parser-js` parses the User-Agent into device type (or desktop fallback), OS name/version, and browser name/major version.

### 66. How is referrer vs referrer source handled?

**Answer:** Raw `Referer` header saved (trimmed) as `referrer`. `referrer_source` is the hostname, or `direct` if missing, or `unknown` if unparsable. Dashboards group by source for cleaner charts.

### 67. Why use a DB transaction when recording a click?

**Answer:** We check prior visitor hash, insert click row, and update link counters together. A transaction keeps those consistent — if insert fails we don’t leave counters half-updated (BEGIN / COMMIT / ROLLBACK).

### 68. Difference between `click_count` on `links` and rows in `link_clicks`?

**Answer:** `link_clicks` is the detailed event log. `links.click_count` / `unique_click_count` are denormalized totals for fast list/dashboard reads without aggregating the whole log every time.

### 69. What breakdowns does the Analytics page show?

**Answer:** Totals (clicks/unique), clicks by day and by hour, and top buckets for country, city, device, OS, browser, referrer source, plus a recent clicks table. Can scope to one link or all links.

### 70. How does the account-wide overview differ from per-link analytics?

**Answer:** Overview (`/api/analytics/overview`) joins all of the user’s links — last 30 days by date, top links, account-level breakdowns, recent across all. Per-link (`/api/links/:id/analytics`) filters to one owned link and its own history/totals.

---

## 9. Reports & Exports

### 71. How does the Reports date-range filter work?

**Answer:** UI sends `from` / `to` (and optional `linkId`) to `GET /api/reports`. Server defaults to last 30 days if omitted, validates order, ownership-checks linkId, returns summary + per-link range stats + up to 5000 click rows.

### 72. Why cap report click rows (5000) and expose `truncated`?

**Answer:** Protect memory/response size. Clients still get a useful export; `truncated: true` tells the UI the log was cut so users know it’s not the full history.

### 73. How is CSV export implemented on the client?

**Answer:** `downloadCsvReport` builds header + rows, escapes cells, prefixes UTF-8 BOM, creates a Blob, and triggers an `<a download>` click. No server file generation required.

### 74. How is PDF export implemented without a heavy PDF library?

**Answer:** A lightweight custom PDF writer builds a simple text PDF (escaped ASCII content, clipped columns) and downloads it as a blob. Good enough for a demo report; not a full PDF engine.

### 75. What privacy concerns exist when exporting click logs?

**Answer:** Exports include timestamps, geo, device, and referrers — potentially sensitive. Only the owning authenticated user can fetch them, but they should treat downloads carefully. Hashing IPs helps, but geo/UA can still be identifying in aggregate.

---

## 10. Rate Limiting & Abuse Prevention

### 76. Which endpoints are rate-limited, and why those specifically?

**Answer:** Register, login, shorten, and public redirect (plus a broad public IP limiter). Those are the abuse vectors: account spam, password guessing, mass link creation, and click farming / redirect loops. Read-only authenticated analytics are less critical.

### 77. Difference between IP-based and user-based shorten limits?

**Answer:** IP limits stop one network from fanning out creates across many accounts. User hourly/daily limits stop a single authenticated account from flooding. Both apply on `/api/shorten`.

### 78. Why does login limiting use `skipSuccessfulRequests`?

**Answer:** So normal successful logins don’t burn the budget. Only failures count toward the 10-attempts / 15-minute window — better UX for legitimate users, still slows brute force.

### 79. Why limit failed logins by **account email** as well as IP?

**Answer:** IP-only limits fail when attackers distribute guesses across many IPs targeting one mailbox. Account-keyed limiter (`login:email`) throttles that. IP limiter still slows spray-from-one-network attacks.

### 80. How does redirect rate limiting help against click farming?

**Answer:** Caps redirects per IP per minute (default 120). Inflating click counts from one address gets throttled, reducing fake analytics and load on DB/geo.

### 81. Why is `trust proxy` enabled?

**Answer:** Behind reverse proxies, `req.ip` would otherwise be the proxy. `trust proxy` + `X-Forwarded-For` / `X-Real-IP` yields the real client IP for geo and rate limits. Misconfiguration can be abused, so only trust your own proxy layer.

### 82. How would you move rate limits to Redis for multi-instance deploys?

**Answer:** Configure `express-rate-limit` with a Redis store (e.g. `rate-limit-redis`) so counters are shared across Node processes. Otherwise each instance has its own memory counters and effective limits multiply with replica count.

---

## 11. Database & SQL

### 83. Explain the schema: `users`, `links`, `link_clicks`.

**Answer:** `users` hold credentials. `links` map `short_code` → `long_url` owned by a user, with counters and lifecycle fields. `link_clicks` is the event log per redirect with visitor/geo/UA/referrer fields, FK to `links`.

### 84. Why `ON DELETE CASCADE` from users → links → clicks?

**Answer:** Deleting a user should remove their links; deleting a link should remove its click history. Keeps referential integrity without orphaned rows or manual cleanup.

### 85. Why index `(user_id, long_url)`?

**Answer:** Speeds the “already shortened this URL?” reuse query per user. Without it, each shorten would scan more of the links table as data grows.

### 86. Why index `(link_id, clicked_at)` and `(link_id, visitor_hash)`?

**Answer:** `(link_id, clicked_at)` accelerates time-series analytics/reports. `(link_id, visitor_hash)` speeds the “have we seen this visitor?” unique check on every click.

### 87. How do you handle Postgres unique violations (`23505`)?

**Answer:** Catch `err.code === '23505'`. For email → 409 already registered. For custom alias → 409 taken. For random short code → retry insert. This relies on DB constraints as the source of truth under concurrency.

### 88. Why use parameterized queries instead of string concatenation?

**Answer:** Prevents SQL injection. Values are sent separately from SQL (`$1`, `$2`, …). User-controlled URL/title/email never become executable SQL.

### 89. How does `enableDueLinks` work in SQL terms?

**Answer:** `UPDATE links SET enabled = TRUE WHERE enabled = FALSE AND activates_at IS NOT NULL AND activates_at <= NOW()` plus optional filters on `user_id` / `id`, returning updated rows. Used when listing links or on redirect.

### 90. How would you paginate links and click history for large accounts?

**Answer:** Cursor or `LIMIT/OFFSET` (prefer keyset on `created_at/id` or `clicked_at/id`) on list and recent-click endpoints. Reports already soft-cap at 5000; I’d add explicit page tokens and date partitions/archives for very large logs.

---

## 12. Frontend (React + Vite)

### 91. How is auth state managed in the React app?

**Answer:** `token` / `userEmail` in React state, hydrated from `localStorage`. On mount with a token, call `/api/me` and `/api/links`. Failed auth clears session. Logout removes keys and resets view. No Redux — local state is enough.

### 92. How do the Dashboard / My Links / Analytics / Reports pages differ?

**Answer:** **Dashboard** — account snapshot and recent activity. **My Links** — create/edit/manage links + QR + safety. **Analytics** — deeper charts for all or one link. **Reports** — filtered range + CSV/PDF export. Side nav switches `view` in `App.jsx`.

### 93. How does QR code generation and download work?

**Answer:** `QRCodeCanvas` from `qrcode.react` renders the short URL. Download finds the canvas by id, `toDataURL('image/png')`, and triggers a temporary download link.

### 94. How do link filters (active / scheduled / disabled) work?

**Answer:** Client-side filters on My Links using link status helpers: active (enabled and live), scheduled (future `activates_at` / not live yet), disabled. Combined with search text and sort (newest, clicks, etc.).

### 95. How is light/dark theme persisted?

**Answer:** `shortly_theme` in localStorage. Initial theme uses stored value, else `prefers-color-scheme`. Toggling writes storage and sets `document.documentElement.dataset.theme`.

### 96. Why refresh links on window focus / visibility change?

**Answer:** Counters and enable-state can change from redirects or schedule promotion while the tab is backgrounded. Refreshing on focus keeps the UI reasonably fresh without websockets.

### 97. How does the client talk to the API (`VITE_API_URL`)?

**Answer:** `api.js` uses `import.meta.env.VITE_API_URL || 'http://localhost:3000'`. All helpers share a `request()` that attaches JSON headers/Bearer token and throws with server `error` (and optional `safety`) on failure.

### 98. What happens in the UI when a destination is blocked?

**Answer:** Shorten/update fails with 403; error message explains malicious vs phishing block. Safety preview already shows `Blocked` pill and indicators. Create shouldn’t succeed for `verdict: block`.

---

## 13. Security Deep Dive

### 99. List security measures already in this project.

**Answer:** bcrypt passwords, JWT auth + ownership checks, parameterized SQL, http(s)-only URLs, destination safety on create/edit/redirect, reserved aliases, rate limits on auth/shorten/redirect, vague login errors, hashed visitor fingerprints, optional Safe Browsing / env blocklist.

### 100. What is open-redirect risk, and how do you detect it in destinations?

**Answer:** A URL that takes users to a third-party host via params like `url`, `redirect`, `next`, etc. Our inspector flags when such a param points to a different hostname — raises suspicious risk so users don’t shorten open-redirector landing pages unknowingly.

### 101. How do you mitigate XSS / injection on the API?

**Answer:** JSON API with parameterized SQL; React escapes rendered text by default. We validate/normalize inputs (URL, alias, title length). Still: JWT in localStorage means XSS on the SPA is dangerous — CSP and cookie auth would harden further.

### 102. Are short links a phishing vector themselves? How do you reduce that?

**Answer:** Yes — short links hide the final URL. We reduce risk by screening destinations, blocking high-confidence bad ones even on redirect, showing safety reports before create, and letting owners disable links. Further ideas: interstitial warning pages for `warn` verdicts, preview of final domain.

### 103. What CORS considerations exist in production?

**Answer:** Dev uses open `cors()`. Production should allow only the real frontend origin(s), especially if moving to cookie auth. Wide-open CORS with credentialed cookies would be unsafe.

### 104. What secrets belong in `.env` and must never be committed?

**Answer:** `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_SAFE_BROWSING_API_KEY`, and any production rate-limit/tuning secrets. `.gitignore` should exclude `.env`; use examples with placeholders only.

### 105. How would you add email verification / disposable-email blocking?

**Answer:** On register, reject domains in a disposable list (package already present but unused). Send a signed verification email link before enabling login (or mark `email_verified`). Store token hash + expiry; only verified users can shorten.

---

## 14. Performance & Reliability

### 106. Why might redirect latency increase under load?

**Answer:** Every redirect hits Postgres; concurrent click transactions contend; Safe Browsing on redirect adds network RTT when enabled; single Node event loop + no redirect cache. Geo is after redirect so it’s less of a user-facing latency issue.

### 107. Should geo lookup / Safe Browsing block the redirect response? Why not?

**Answer:** Geo: no — keep it async after redirect. Safe Browsing: currently awaited on redirect for safety correctness, with a short timeout; at scale you might cache results and fail-open/fail-closed by policy. Blocking geo would punish every click with third-party latency.

### 108. How would you make click analytics eventually consistent but durable?

**Answer:** Push click events to a queue/stream, ACK redirect immediately (after authz/safety), workers batch-insert into Postgres and update counters. Use idempotency keys if retries happen. Accept brief lag on dashboards for much higher redirect throughput.

### 109. How would you add monitoring / alerting (failed redirects, safety blocks, 5xx)?

**Answer:** Structured logs + metrics (Prometheus/OpenTelemetry): redirect latency, 404/403 rates, safety block counts, DB pool errors, rate-limit hits. Alerts on 5xx spikes and DB connection failures. Optional request tracing IDs across API calls.

### 110. What tests would you add first (unit, integration, e2e)?

**Answer:**
- **Unit:** `inspectUrl` fixtures, `normalizeCustomAlias`, visitor uniqueness helpers.
- **Integration:** register/login/shorten/redirect with a test DB; ownership 404s; rate-limit smoke.
- **E2E:** create link in UI → open short URL → see analytics row / disabled link blocked.

---

## 15. Behavioral / Ownership Questions (Project-Framed)

### 111. Tell me about a hard bug you hit while building Shortly.

**Answer (template — personalize):** Scheduled links auto-re-enabled after manual disable because `activates_at` was still in the past. Fix: when disabling an already-due link, clear `activates_at` so disable sticks. Lesson: lifecycle flags interact; test state transitions, not just happy paths.

### 112. A design tradeoff you made (in-memory cache, fire-and-forget analytics, JWT in localStorage).

**Answer:** Example — fire-and-forget analytics after redirect trades strict “click always recorded before response finishes” for lower latency. Rare lost events under crash are acceptable for this product; counters stay transactional when the write runs. I’d revisit with a queue at higher scale.

### 113. Something you shipped that you’re proud of, and why.

**Answer:** The safety engine — it’s explainable (indicators + risk), layered (local + optional GSB), and enforced at multiple trust boundaries (create/edit/redirect + live UI). It turns a basic shortener into something that considers real abuse patterns.

### 114. A feature you scoped out on purpose.

**Answer:** Examples: teams/orgs, paid plans, link password protection, full interstitial warning pages, Redis, email verification. Scoped out to keep a coherent MVP with depth in safety + analytics instead of shallow feature sprawl.

### 115. How you would onboard a new teammate onto this codebase?

**Answer:** Start with README + schema, run client/server locally, walk create → redirect → analytics path in code (`linkController`, `clickAnalytics`, `urlSafety`), then point at `INTERVIEW_PROJECT_GUIDE.md` / this Q&A for product context. First task: a small test or pagination PR.

---

## Quick “trap” questions interviewers love

### 116. Can two users have the same custom alias?

**Answer:** **No.** `short_code` is globally unique. Short URLs must resolve without knowing the owner.

### 117. If the server restarts, do short links still work?

**Answer:** **Yes.** Data lives in Postgres. Only the in-memory reuse cache (and in-memory rate-limit counters) reset.

### 118. Does disabling a link delete analytics?

**Answer:** **No.** History in `link_clicks` and counters remain; only new redirects are blocked with 403.

### 119. Is Safe Browsing required for the app to run?

**Answer:** **No.** Local heuristics work without a key. GSB is an optional strengthening layer.

### 120. Is unique click “once forever” or “once per day”?

**Answer:** **Once forever per link** for that visitor hash (IP+UA). Returning visitors don’t increment `unique_click_count` again.
