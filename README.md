# Shortly — URL Shortener

Full-stack URL shortener with JWT auth, PostgreSQL storage, destination safety checks, click analytics, and a React UI.

## Stack

- **Server:** Express, PostgreSQL (`pg`), bcrypt, JWT, Helmet, rate limiting
- **Client:** Vite + React

## Setup

### 1. Database

Create a Postgres database and apply the schema:

```bash
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE url_shortener;"
psql -U postgres -h 127.0.0.1 -d url_shortener -f server/src/sql/schema.sql
```

Or from `server/` after setting `DATABASE_URL`:

```bash
npm run schema
```

Copy env defaults:

```bash
cp server/.env.example server/.env
```

Update `server/.env`:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/url_shortener
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars
CORS_ORIGINS=http://localhost:5173
```

`JWT_SECRET` must be at least 32 characters and must not be `change-me` — the API refuses to start otherwise.

### 2. Server

```bash
cd server
npm install
npm run dev
```

API: http://localhost:3000  
Health: http://localhost:3000/health

### 3. Client

```bash
cd client
npm install
npm run dev
```

UI: http://localhost:5173

Optional: set `VITE_API_URL` if the API is not on `http://localhost:3000`.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/register` | No | Create account `{ email, password }` (min 8 chars, letter + number; disposable emails blocked) |
| POST | `/api/login` | No | Get JWT `{ email, password }` |
| GET | `/api/me` | Bearer | Current user from token |
| POST | `/api/safety` | Bearer | Live destination safety check `{ longUrl }` |
| POST | `/api/shorten` | Bearer | Create short link `{ longUrl, title?, customAlias?, activatesAt?, expiresAt?, enabled? }` |
| GET | `/api/links` | Bearer | List links (`?limit=&offset=`) → `{ links, total, limit, offset }` |
| PATCH | `/api/links/:id` | Bearer | Update destination, title, enabled, schedule, or expiry |
| DELETE | `/api/links/:id` | Bearer | Delete a link |
| GET | `/api/analytics/overview` | Bearer | Dashboard aggregates |
| GET | `/api/links/:id/analytics` | Bearer | Per-link analytics |
| GET | `/api/reports` | Bearer | Report payload (`?from=&to=&linkId=`) |
| GET | `/health` | No | Liveness + DB check |
| GET | `/:code` | No | Redirect + record click analytics |

## Features

- Custom aliases, titles, activate-at scheduling, and expiry
- Destination safety (local heuristics + optional Google Safe Browsing)
- Click analytics (geo, device, OS, browser, referrer, unique visitors)
- CSV/PDF reports and QR codes in the UI
- Rate limits on auth, shorten, and redirect paths

## Tests

```bash
cd server && npm test
cd client && npm run lint
```

## Optional env

| Variable | Purpose |
|----------|---------|
| `GOOGLE_SAFE_BROWSING_API_KEY` | Live Safe Browsing on create/update |
| `BLOCKED_DOMAINS` | Extra comma-separated blocked hosts |
| `GEO_LOOKUP_URL` | Override click geo provider (default `https://ipapi.co`) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `URL_CACHE_MAX` / `URL_CACHE_TTL_MS` | In-memory “already shortened?” cache |
