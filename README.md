# Shortly — URL Shortener

Full-stack URL shortener with JWT auth, PostgreSQL storage, and a React UI.

## Stack

- **Server:** Express, PostgreSQL (`pg`), bcrypt, JWT
- **Client:** Vite + React

## Setup

### 1. Database

Create a Postgres database and apply the schema:

```bash
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE url_shortener;"
psql -U postgres -h 127.0.0.1 -d url_shortener -f server/src/sql/schema.sql
```

Update `server/.env` if your credentials differ:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/url_shortener
PORT=3000
JWT_SECRET=change-me
```

### 2. Server

```bash
cd server
npm install
npm run dev
```

API: http://localhost:3000

### 3. Client

```bash
cd client
npm install
npm run dev
```

UI: http://localhost:5173

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/register` | No | Create account `{ email, password }` |
| POST | `/api/login` | No | Get JWT `{ email, password }` |
| POST | `/api/shorten` | Bearer | Create short link `{ longUrl }` |
| GET | `/api/links` | Bearer | List your links |
| GET | `/:code` | No | Redirect + increment clicks |
