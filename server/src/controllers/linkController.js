import pool from '../db.js';
import { generateShortCode } from '../utils/shortCode.js';
import { getCachedLink, setCachedLink } from '../utils/urlCache.js';

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function findExistingLink(userId, longUrl) {
  const cached = getCachedLink(userId, longUrl);
  if (cached) {
    // Cache only proves the mapping exists; always re-read click_count from DB
    const fresh = await pool.query(
      `SELECT id, short_code, long_url, click_count, created_at
       FROM links
       WHERE id = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [cached.id]
    );
    const link = fresh.rows[0] ?? null;
    if (link) {
      setCachedLink(userId, longUrl, link);
      return link;
    }
  }

  const result = await pool.query(
    `SELECT id, short_code, long_url, click_count, created_at
     FROM links
     WHERE user_id = $1
       AND long_url = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId, longUrl]
  );

  const link = result.rows[0] ?? null;
  if (link) setCachedLink(userId, longUrl, link);
  return link;
}

export async function createShortLink(req, res) {
  const longUrl = typeof req.body.longUrl === 'string' ? req.body.longUrl.trim() : '';
  const userId = req.user.userId;

  if (!longUrl) {
    return res.status(400).json({ error: 'longUrl is required' });
  }

  if (!isValidUrl(longUrl)) {
    return res.status(400).json({ error: 'longUrl must be a valid http(s) URL' });
  }

  try {
    const existing = await findExistingLink(userId, longUrl);
    if (existing) {
      return res.status(200).json({ link: existing, cached: true });
    }

    let shortCode;
    let inserted = false;
    let attempts = 0;

    while (!inserted && attempts < 5) {
      shortCode = generateShortCode();
      attempts++;

      try {
        const result = await pool.query(
          `INSERT INTO links (short_code, long_url, user_id)
           VALUES ($1, $2, $3)
           RETURNING id, short_code, long_url, click_count, created_at`,
          [shortCode, longUrl, userId]
        );
        const link = result.rows[0];
        setCachedLink(userId, longUrl, link);
        inserted = true;
        return res.status(201).json({ link, cached: false });
      } catch (err) {
        if (err.code === '23505') {
          // Unique short_code collision — retry with a new code
          continue;
        }
        throw err;
      }
    }

    return res
      .status(500)
      .json({ error: 'Could not generate a unique short code, try again' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function getMyLinks(req, res) {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT id, short_code, long_url, click_count, created_at
       FROM links
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ links: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function redirectToLongUrl(req, res) {
  const { code } = req.params;

  // Keep reserved API paths from being treated as short codes
  if (['api', 'test-db'].includes(code)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const result = await pool.query(
      `UPDATE links
       SET click_count = click_count + 1
       WHERE short_code = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING long_url`,
      [code]
    );

    const link = result.rows[0];

    if (!link) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    res.redirect(link.long_url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
