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
