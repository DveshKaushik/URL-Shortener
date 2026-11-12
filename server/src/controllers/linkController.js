import pool from '../db.js';
import { generateShortCode } from '../utils/shortCode.js';

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function createShortLink(req, res) {
  const { longUrl } = req.body;
  const userId = req.user.userId;

  if (!longUrl) {
    return res.status(400).json({ error: 'longUrl is required' });
  }

  if (!isValidUrl(longUrl)) {
    return res.status(400).json({ error: 'longUrl must be a valid http(s) URL' });
  }

  try {
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
        inserted = true;
        return res.status(201).json({ link: result.rows[0] });
      } catch (err) {
        if (err.code === '23505') {
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
