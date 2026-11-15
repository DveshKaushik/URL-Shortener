-- server/src/sql/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  short_code VARCHAR(64) UNIQUE NOT NULL,
  long_url TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  activates_at TIMESTAMPTZ
);

-- Safe to re-run on existing databases
ALTER TABLE links ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE links ADD COLUMN IF NOT EXISTS activates_at TIMESTAMPTZ;
ALTER TABLE links
  ALTER COLUMN activates_at TYPE TIMESTAMPTZ
  USING CASE
    WHEN activates_at IS NULL THEN NULL
    ELSE activates_at AT TIME ZONE 'UTC'
  END;
ALTER TABLE links ALTER COLUMN short_code TYPE VARCHAR(64);

-- Speeds up "already shortened?" lookups per user
CREATE INDEX IF NOT EXISTS idx_links_user_long_url ON links (user_id, long_url);

ALTER TABLE links ADD COLUMN IF NOT EXISTS unique_click_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE links ADD COLUMN IF NOT EXISTS title VARCHAR(80);
ALTER TABLE links ADD COLUMN IF NOT EXISTS safety_verdict VARCHAR(16);
ALTER TABLE links ADD COLUMN IF NOT EXISTS safety_checked_at TIMESTAMPTZ;

-- One row per redirect click (server-side analytics)
CREATE TABLE IF NOT EXISTS link_clicks (
  id SERIAL PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_hash VARCHAR(64) NOT NULL,
  is_unique BOOLEAN NOT NULL DEFAULT FALSE,
  country VARCHAR(100),
  city VARCHAR(100),
  device VARCHAR(50),
  os VARCHAR(100),
  browser VARCHAR(100),
  referrer TEXT,
  referrer_source VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks (link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks (link_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_link_clicks_visitor ON link_clicks (link_id, visitor_hash);