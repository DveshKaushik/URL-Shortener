import pool from '../db.js';
import {
  generateShortCode,
  isReservedAlias,
  normalizeCustomAlias,
} from '../utils/shortCode.js';
import {
  deleteCachedLink,
  getCachedLink,
  setCachedLink,
} from '../utils/urlCache.js';
import { recordLinkClick } from '../utils/clickAnalytics.js';
import { inspectUrl, inspectUrlLocal, safetyError } from '../utils/urlSafety.js';

const LINK_COLUMNS =
  'id, short_code, long_url, title, click_count, unique_click_count, created_at, expires_at, enabled, activates_at, safety_verdict, safety_checked_at';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function rejectUnsafeDestination(res, longUrl) {
  const safety = await inspectUrl(longUrl);
  if (safety.verdict !== 'block') return safety;
  res.status(403).json({ error: safetyError(safety), safety });
  return null;
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** null clears the name; undefined means the field was omitted or invalid. */
function parseTitle(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const title = value.trim();
  if (title.length > 80) return undefined;
  return title || null;
}

function parsePage(query) {
  const limitRaw = Number(query.limit);
  const offsetRaw = Number(query.offset);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limitRaw)))
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;
  return { limit, offset };
}

/** When activates_at is due, turn disabled links on. */
async function enableDueLinks({ userId, linkId } = {}) {
  const filters = [
    'enabled = FALSE',
    'activates_at IS NOT NULL',
    'activates_at <= NOW()',
  ];
  const values = [];

  if (userId != null) {
    values.push(userId);
    filters.push(`user_id = $${values.length}`);
  }
  if (linkId != null) {
    values.push(linkId);
    filters.push(`id = $${values.length}`);
  }

  const result = await pool.query(
    `UPDATE links
     SET enabled = TRUE
     WHERE ${filters.join(' AND ')}
     RETURNING ${LINK_COLUMNS}`,
    values
  );

  return result.rows;
}

async function findExistingLink(userId, longUrl) {
  const cached = getCachedLink(userId, longUrl);
  if (cached) {
    const fresh = await pool.query(
      `SELECT ${LINK_COLUMNS}
       FROM links
       WHERE id = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [cached.id]
    );
    const link = fresh.rows[0] ?? null;
    if (link) {
      setCachedLink(userId, longUrl, link);
    }
    return link;
  }

  const result = await pool.query(
    `SELECT ${LINK_COLUMNS}
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

export async function checkDestination(req, res) {
  const longUrl = typeof req.body.longUrl === 'string' ? req.body.longUrl.trim() : '';

  if (!longUrl) {
    return res.status(400).json({ error: 'longUrl is required' });
  }
  if (!isValidUrl(longUrl)) {
    return res.status(400).json({ error: 'longUrl must be a valid http(s) URL' });
  }

  try {
    const safety = await inspectUrl(longUrl);
    res.json({ safety });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function createShortLink(req, res) {
  const longUrl = typeof req.body.longUrl === 'string' ? req.body.longUrl.trim() : '';
  const userId = req.user.userId;
  const enabled = req.body.enabled === false ? false : true;
  const activatesAt = parseOptionalDate(req.body.activatesAt);
  const expiresAt = parseOptionalDate(req.body.expiresAt);
  const title = parseTitle(req.body.title);
  const wantsCustomAlias =
    req.body.customAlias !== undefined &&
    req.body.customAlias !== null &&
    String(req.body.customAlias).trim() !== '';

  if (!longUrl) {
    return res.status(400).json({ error: 'longUrl is required' });
  }

  if (!isValidUrl(longUrl)) {
    return res.status(400).json({ error: 'longUrl must be a valid http(s) URL' });
  }

  let safety;
  try {
    safety = await rejectUnsafeDestination(res, longUrl);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
  if (!safety) return;

  if (activatesAt === undefined) {
    return res.status(400).json({ error: 'activatesAt must be a valid date' });
  }

  if (expiresAt === undefined) {
    return res.status(400).json({ error: 'expiresAt must be a valid date' });
  }

  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return res.status(400).json({ error: 'expiresAt must be in the future' });
  }

  if (activatesAt && expiresAt && new Date(expiresAt) <= new Date(activatesAt)) {
    return res.status(400).json({ error: 'expiresAt must be after activatesAt' });
  }

  if (req.body.title !== undefined && title === undefined) {
    return res.status(400).json({ error: 'title must be 80 characters or fewer' });
  }

  let customAlias = null;
  if (wantsCustomAlias) {
    const normalized = normalizeCustomAlias(req.body.customAlias);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }
    customAlias = normalized.alias;
  }

  const safetyVerdict = safety.verdict;
  const safetyCheckedAt = new Date().toISOString();

  try {
    if (!customAlias) {
      const existing = await findExistingLink(userId, longUrl);
      if (existing) {
        if ('activatesAt' in req.body || 'expiresAt' in req.body) {
          const nextActivates =
            'activatesAt' in req.body ? activatesAt : existing.activates_at;
          const nextExpires =
            'expiresAt' in req.body ? expiresAt : existing.expires_at;
          if (
            nextActivates &&
            nextExpires &&
            new Date(nextExpires) <= new Date(nextActivates)
          ) {
            return res
              .status(400)
              .json({ error: 'expiresAt must be after activatesAt' });
          }

          const sets = [
            'safety_verdict = $1',
            'safety_checked_at = $2',
          ];
          const params = [safetyVerdict, safetyCheckedAt];
          if ('activatesAt' in req.body) {
            params.push(activatesAt);
            sets.push(`activates_at = $${params.length}`);
          }
          if ('expiresAt' in req.body) {
            params.push(expiresAt);
            sets.push(`expires_at = $${params.length}`);
          }
          params.push(existing.id, userId);

          const result = await pool.query(
            `UPDATE links
             SET ${sets.join(', ')}
             WHERE id = $${params.length - 1} AND user_id = $${params.length}
             RETURNING ${LINK_COLUMNS}`,
            params
          );
          const link = result.rows[0] ?? existing;
          setCachedLink(userId, longUrl, link);
          return res.status(200).json({ link, cached: true, safety });
        }
        return res.status(200).json({ link: existing, cached: true, safety });
      }
    }

    const insertSql = `INSERT INTO links (
         short_code, long_url, user_id, enabled, activates_at, expires_at, title,
         safety_verdict, safety_checked_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${LINK_COLUMNS}`;

    if (customAlias) {
      try {
        const result = await pool.query(insertSql, [
          customAlias,
          longUrl,
          userId,
          enabled,
          activatesAt,
          expiresAt,
          title ?? null,
          safetyVerdict,
          safetyCheckedAt,
        ]);
        const link = result.rows[0];
        setCachedLink(userId, longUrl, link);
        return res.status(201).json({ link, cached: false, safety });
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: 'That alias is already taken' });
        }
        throw err;
      }
    }

    let shortCode;
    let inserted = false;
    let attempts = 0;

    while (!inserted && attempts < 5) {
      shortCode = generateShortCode();
      attempts++;

      try {
        const result = await pool.query(insertSql, [
          shortCode,
          longUrl,
          userId,
          enabled,
          activatesAt,
          expiresAt,
          title ?? null,
          safetyVerdict,
          safetyCheckedAt,
        ]);
        const link = result.rows[0];
        setCachedLink(userId, longUrl, link);
        inserted = true;
        return res.status(201).json({ link, cached: false, safety });
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
  const { limit, offset } = parsePage(req.query);

  try {
    await enableDueLinks({ userId });

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM links WHERE user_id = $1`,
      [userId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT ${LINK_COLUMNS}
       FROM links
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({ links: result.rows, total, limit, offset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function updateLink(req, res) {
  const userId = req.user.userId;
  const linkId = Number(req.params.id);

  if (!Number.isInteger(linkId) || linkId < 1) {
    return res.status(400).json({ error: 'Invalid link id' });
  }

  const updates = [];
  const values = [];
  let i = 1;
  let nextLongUrl = null;
  let destinationSafety = null;

  if ('longUrl' in req.body) {
    const longUrl =
      typeof req.body.longUrl === 'string' ? req.body.longUrl.trim() : '';
    if (!longUrl) {
      return res.status(400).json({ error: 'longUrl is required' });
    }
    if (!isValidUrl(longUrl)) {
      return res
        .status(400)
        .json({ error: 'longUrl must be a valid http(s) URL' });
    }
    try {
      destinationSafety = await rejectUnsafeDestination(res, longUrl);
      if (!destinationSafety) return;
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong' });
    }
    nextLongUrl = longUrl;
    updates.push(`long_url = $${i++}`);
    values.push(longUrl);
    updates.push(`safety_verdict = $${i++}`);
    values.push(destinationSafety.verdict);
    updates.push(`safety_checked_at = $${i++}`);
    values.push(new Date().toISOString());
  }

  if (typeof req.body.enabled === 'boolean') {
    updates.push(`enabled = $${i++}`);
    values.push(req.body.enabled);
  }

  if ('title' in req.body) {
    const title = parseTitle(req.body.title);
    if (title === undefined) {
      return res.status(400).json({ error: 'title must be 80 characters or fewer' });
    }
    updates.push(`title = $${i++}`);
    values.push(title);
  }

  if ('activatesAt' in req.body) {
    const activatesAt = parseOptionalDate(req.body.activatesAt);
    if (activatesAt === undefined) {
      return res.status(400).json({ error: 'activatesAt must be a valid date' });
    }
    updates.push(`activates_at = $${i++}`);
    values.push(activatesAt);
  } else if (req.body.enabled === false) {
    updates.push(
      `activates_at = CASE
         WHEN activates_at IS NOT NULL AND activates_at <= NOW() THEN NULL
         ELSE activates_at
       END`
    );
  }

  let parsedExpiresAt;
  if ('expiresAt' in req.body) {
    parsedExpiresAt = parseOptionalDate(req.body.expiresAt);
    if (parsedExpiresAt === undefined) {
      return res.status(400).json({ error: 'expiresAt must be a valid date' });
    }
    if (parsedExpiresAt && new Date(parsedExpiresAt) <= new Date()) {
      return res.status(400).json({ error: 'expiresAt must be in the future' });
    }
    updates.push(`expires_at = $${i++}`);
    values.push(parsedExpiresAt);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(linkId, userId);

  try {
    const previous = await pool.query(
      `SELECT long_url, activates_at, expires_at
       FROM links WHERE id = $1 AND user_id = $2`,
      [linkId, userId]
    );

    if (!previous.rows[0]) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const current = previous.rows[0];
    const nextActivates =
      'activatesAt' in req.body
        ? parseOptionalDate(req.body.activatesAt)
        : current.activates_at;
    const nextExpires =
      'expiresAt' in req.body ? parsedExpiresAt : current.expires_at;
    if (
      nextActivates &&
      nextExpires &&
      new Date(nextExpires) <= new Date(nextActivates)
    ) {
      return res
        .status(400)
        .json({ error: 'expiresAt must be after activatesAt' });
    }

    const result = await pool.query(
      `UPDATE links
       SET ${updates.join(', ')}
       WHERE id = $${i++}
         AND user_id = $${i}
       RETURNING ${LINK_COLUMNS}`,
      values
    );

    let link = result.rows[0];
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const promoted = await enableDueLinks({ userId, linkId: link.id });
    if (promoted[0]) link = promoted[0];

    if (nextLongUrl != null) {
      const oldUrl = current.long_url;
      if (oldUrl !== link.long_url) {
        deleteCachedLink(userId, oldUrl);
      }
    }

    setCachedLink(userId, link.long_url, link);
    res.json({ link, ...(destinationSafety ? { safety: destinationSafety } : {}) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function deleteLink(req, res) {
  const userId = req.user.userId;
  const linkId = Number(req.params.id);

  if (!Number.isInteger(linkId) || linkId < 1) {
    return res.status(400).json({ error: 'Invalid link id' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM links
       WHERE id = $1 AND user_id = $2
       RETURNING id, long_url`,
      [linkId, userId]
    );

    const deleted = result.rows[0];
    if (!deleted) {
      return res.status(404).json({ error: 'Link not found' });
    }

    deleteCachedLink(userId, deleted.long_url);
    res.json({ ok: true, id: deleted.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function redirectToLongUrl(req, res) {
  const { code } = req.params;

  if (isReservedAlias(code)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const lookup = await pool.query(
      `SELECT id, long_url, enabled, activates_at, expires_at, safety_verdict
       FROM links
       WHERE short_code = $1`,
      [code]
    );

    const link = lookup.rows[0];

    if (!link) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    if (link.activates_at && new Date(link.activates_at) > new Date()) {
      return res.status(403).json({
        error: 'This link is not active yet',
        activatesAt: link.activates_at,
      });
    }

    if (!link.enabled && link.activates_at) {
      const promoted = await enableDueLinks({ linkId: link.id });
      if (promoted[0]) {
        link.enabled = true;
      }
    }

    if (!link.enabled) {
      return res.status(403).json({ error: 'This link is disabled' });
    }

    if (link.safety_verdict === 'block') {
      return res.status(403).json({
        error: 'This short link points to a blocked destination',
      });
    }

    // Local-only check on the hot path — no Safe Browsing network call
    const safety = inspectUrlLocal(link.long_url);
    if (safety.verdict === 'block') {
      return res.status(403).json({
        error: 'This short link points to a blocked destination',
        safety,
      });
    }

    res.redirect(link.long_url);

    recordLinkClick(req, link.id).catch((err) => {
      console.error('Failed to record click analytics:', err);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
