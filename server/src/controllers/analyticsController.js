import pool from '../db.js';

async function loadOwnedLink(userId, linkId) {
  const result = await pool.query(
    `SELECT id, short_code, click_count, unique_click_count, created_at
     FROM links
     WHERE id = $1 AND user_id = $2`,
    [linkId, userId]
  );
  return result.rows[0] ?? null;
}

async function groupCounts(linkId, column, { nullLabel = 'Unknown', limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(${column}), ''), $2) AS label,
            COUNT(*)::int AS count
     FROM link_clicks
     WHERE link_id = $1
     GROUP BY 1
     ORDER BY count DESC, label ASC
     LIMIT $3`,
    [linkId, nullLabel, limit]
  );
  return result.rows;
}

const BREAKDOWN_COLUMNS = {
  country: 'c.country',
  city: 'c.city',
  device: 'c.device',
  os: 'c.os',
  browser: 'c.browser',
  referrer_source: 'c.referrer_source',
};

async function accountBreakdown(userId, key, { nullLabel = 'Unknown', limit = 8 } = {}) {
  const column = BREAKDOWN_COLUMNS[key];
  const result = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(${column}), ''), $2) AS label,
            COUNT(*)::int AS count
     FROM link_clicks c
     JOIN links l ON l.id = c.link_id
     WHERE l.user_id = $1
     GROUP BY 1
     ORDER BY count DESC, label ASC
     LIMIT $3`,
    [userId, nullLabel, limit]
  );
  return result.rows;
}

function parseInstant(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function getOverview(req, res) {
  const userId = req.user.userId;

  try {
    const [byDate, byHour, topLinks, recent, byCountry, byCity, byDevice, byOs, byBrowser, byReferrer] =
      await Promise.all([
        pool
          .query(
            `SELECT TO_CHAR(c.clicked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                    COUNT(*)::int AS count
             FROM link_clicks c
             JOIN links l ON l.id = c.link_id
             WHERE l.user_id = $1
               AND c.clicked_at >= NOW() - INTERVAL '30 days'
             GROUP BY 1
             ORDER BY 1 ASC`,
            [userId]
          )
          .then((r) => r.rows),
        pool
          .query(
            `SELECT EXTRACT(HOUR FROM c.clicked_at AT TIME ZONE 'UTC')::int AS hour,
                    COUNT(*)::int AS count
             FROM link_clicks c
             JOIN links l ON l.id = c.link_id
             WHERE l.user_id = $1
             GROUP BY 1
             ORDER BY 1 ASC`,
            [userId]
          )
          .then((r) => r.rows),
        pool
          .query(
            `SELECT id, short_code, long_url, title, click_count, unique_click_count
             FROM links
             WHERE user_id = $1
             ORDER BY click_count DESC, created_at DESC
             LIMIT 5`,
            [userId]
          )
          .then((r) => r.rows),
        pool
          .query(
            `SELECT c.clicked_at, c.is_unique, c.country, c.city, c.device, c.os,
                    c.browser, c.referrer_source,
                    l.id AS link_id, l.short_code, l.title
             FROM link_clicks c
             JOIN links l ON l.id = c.link_id
             WHERE l.user_id = $1
             ORDER BY c.clicked_at DESC
             LIMIT 12`,
            [userId]
          )
          .then((r) => r.rows),
        accountBreakdown(userId, 'country'),
        accountBreakdown(userId, 'city'),
        accountBreakdown(userId, 'device'),
        accountBreakdown(userId, 'os'),
        accountBreakdown(userId, 'browser'),
        accountBreakdown(userId, 'referrer_source', { nullLabel: 'direct' }),
      ]);

    res.json({
      breakdowns: {
        byCountry,
        byCity,
        byDevice,
        byOs,
        byBrowser,
        byReferrer,
        byDate,
        byHour,
      },
      topLinks,
      recentClicks: recent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function getReport(req, res) {
  const userId = req.user.userId;
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const from = parseInstant(req.query.from);
  const to = parseInstant(req.query.to);

  if (from === null || to === null) {
    return res.status(400).json({ error: 'from and to must be valid dates' });
  }

  const rangeFrom = from ?? defaultFrom;
  const rangeTo = to ?? now.toISOString();

  if (new Date(rangeFrom) > new Date(rangeTo)) {
    return res.status(400).json({ error: 'from must be before to' });
  }

  let linkId = null;
  if (req.query.linkId !== undefined && req.query.linkId !== '') {
    linkId = Number(req.query.linkId);
    if (!Number.isInteger(linkId) || linkId < 1) {
      return res.status(400).json({ error: 'Invalid link id' });
    }
  }

  try {
    if (linkId != null) {
      const owned = await loadOwnedLink(userId, linkId);
      if (!owned) {
        return res.status(404).json({ error: 'Link not found' });
      }
    }

    const links = await pool.query(
      `SELECT l.id, l.short_code, l.title, l.long_url, l.click_count, l.unique_click_count,
              COUNT(c.id)::int AS clicks_in_range,
              COUNT(c.id) FILTER (WHERE c.is_unique)::int AS unique_in_range
       FROM links l
       LEFT JOIN link_clicks c
         ON c.link_id = l.id
        AND c.clicked_at >= $2
        AND c.clicked_at < $3
       WHERE l.user_id = $1
         AND ($4::int IS NULL OR l.id = $4)
       GROUP BY l.id
       ORDER BY clicks_in_range DESC, l.created_at DESC`,
      [userId, rangeFrom, rangeTo, linkId]
    );

    const clicks = await pool.query(
      `SELECT c.clicked_at, c.is_unique, c.country, c.city, c.device, c.os, c.browser,
              c.referrer_source, c.referrer,
              l.short_code, l.title, l.long_url
       FROM link_clicks c
       JOIN links l ON l.id = c.link_id
       WHERE l.user_id = $1
         AND c.clicked_at >= $2
         AND c.clicked_at < $3
         AND ($4::int IS NULL OR l.id = $4)
       ORDER BY c.clicked_at DESC
       LIMIT 5001`,
      [userId, rangeFrom, rangeTo, linkId]
    );

    const truncated = clicks.rows.length > 5000;
    const rows = truncated ? clicks.rows.slice(0, 5000) : clicks.rows;
    const uniqueClicks = links.rows.reduce((sum, row) => sum + row.unique_in_range, 0);
    const clickTotal = links.rows.reduce((sum, row) => sum + row.clicks_in_range, 0);

    res.json({
      range: { from: rangeFrom, to: rangeTo },
      summary: {
        clicks: clickTotal,
        uniqueClicks,
        links: links.rows.length,
      },
      links: links.rows,
      clicks: rows,
      truncated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function getLinkAnalytics(req, res) {
  const userId = req.user.userId;
  const linkId = Number(req.params.id);

  if (!Number.isInteger(linkId) || linkId < 1) {
    return res.status(400).json({ error: 'Invalid link id' });
  }

  try {
    const link = await loadOwnedLink(userId, linkId);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const [byCountry, byCity, byDevice, byOs, byBrowser, byReferrer, byDate, byHour] =
      await Promise.all([
        groupCounts(linkId, 'country'),
        groupCounts(linkId, 'city'),
        groupCounts(linkId, 'device'),
        groupCounts(linkId, 'os'),
        groupCounts(linkId, 'browser'),
        groupCounts(linkId, 'referrer_source', { nullLabel: 'direct' }),
        pool
          .query(
            `SELECT TO_CHAR(clicked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                    COUNT(*)::int AS count
             FROM link_clicks
             WHERE link_id = $1
             GROUP BY 1
             ORDER BY 1 ASC`,
            [linkId]
          )
          .then((r) => r.rows),
        pool
          .query(
            `SELECT EXTRACT(HOUR FROM clicked_at AT TIME ZONE 'UTC')::int AS hour,
                    COUNT(*)::int AS count
             FROM link_clicks
             WHERE link_id = $1
             GROUP BY 1
             ORDER BY 1 ASC`,
            [linkId]
          )
          .then((r) => r.rows),
      ]);

    const recent = await pool.query(
      `SELECT clicked_at, is_unique, country, city, device, os, browser,
              referrer_source, referrer
       FROM link_clicks
       WHERE link_id = $1
       ORDER BY clicked_at DESC
       LIMIT 100`,
      [linkId]
    );

    res.json({
      link: {
        id: link.id,
        shortCode: link.short_code,
        createdAt: link.created_at,
      },
      totals: {
        clicks: link.click_count ?? 0,
        uniqueClicks: link.unique_click_count ?? 0,
      },
      breakdowns: {
        byCountry,
        byCity,
        byDevice,
        byOs,
        byBrowser,
        byReferrer,
        byDate,
        byHour,
      },
      recentClicks: recent.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
