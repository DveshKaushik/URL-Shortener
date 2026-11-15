import crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import pool from '../db.js';

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  const v = ip.replace(/^::ffff:/i, '');
  if (v === '::1' || v === '127.0.0.1' || v === 'localhost') return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  if (/^fc/i.test(v) || /^fd/i.test(v) || /^fe80/i.test(v)) return true;
  return false;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function visitorHash(ip, userAgent) {
  return crypto
    .createHash('sha256')
    .update(`${ip || 'unknown'}|${userAgent || ''}`)
    .digest('hex')
    .slice(0, 32);
}

function parseDeviceOsBrowser(userAgent) {
  const result = new UAParser(userAgent || '').getResult();
  const deviceType = result.device?.type;
  const device = deviceType
    ? String(deviceType)
    : result.device?.vendor || result.device?.model
      ? 'mobile'
      : 'desktop';

  const osName = result.os?.name || 'Unknown';
  const osVersion = result.os?.version ? ` ${result.os.version}` : '';
  const browserName = result.browser?.name || 'Unknown';
  const browserVersion = result.browser?.version
    ? ` ${result.browser.version.split('.')[0]}`
    : '';

  return {
    device,
    os: `${osName}${osVersion}`.trim(),
    browser: `${browserName}${browserVersion}`.trim(),
  };
}

function parseReferrer(refererHeader) {
  const raw = typeof refererHeader === 'string' ? refererHeader.trim() : '';
  if (!raw) {
    return { referrer: null, referrerSource: 'direct' };
  }
  try {
    const url = new URL(raw);
    return { referrer: raw.slice(0, 2000), referrerSource: url.hostname || 'direct' };
  } catch {
    return { referrer: raw.slice(0, 2000), referrerSource: 'unknown' };
  }
}

async function lookupGeo(ip) {
  if (isPrivateOrLocalIp(ip)) {
    return { country: null, city: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    // Prefer HTTPS. Override with GEO_LOOKUP_URL if you use another provider.
    const geoBase = (process.env.GEO_LOOKUP_URL || 'https://ipapi.co').replace(/\/$/, '');
    const url = geoBase.includes('ip-api.com')
      ? `${geoBase}/${encodeURIComponent(ip)}?fields=status,country,city`
      : `${geoBase}/${encodeURIComponent(ip)}/json/`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { country: null, city: null };
    const data = await res.json();
    if (data.status === 'fail' || data.error) return { country: null, city: null };
    return {
      country: data.country || data.country_name || null,
      city: data.city || null,
    };
  } catch {
    return { country: null, city: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Persist a click event + update totals. Safe to call fire-and-forget after redirect.
 */
export async function recordLinkClick(req, linkId) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = getClientIp(req);
  const hash = visitorHash(ip, userAgent);
  const { device, os, browser } = parseDeviceOsBrowser(userAgent);
  const { referrer, referrerSource } = parseReferrer(req.headers.referer);
  const { country, city } = await lookupGeo(ip);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prior = await client.query(
      `SELECT 1 FROM link_clicks
       WHERE link_id = $1 AND visitor_hash = $2
       LIMIT 1`,
      [linkId, hash]
    );
    const isUnique = prior.rowCount === 0;

    await client.query(
      `INSERT INTO link_clicks (
         link_id, visitor_hash, is_unique,
         country, city, device, os, browser,
         referrer, referrer_source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        linkId,
        hash,
        isUnique,
        country,
        city,
        device,
        os,
        browser,
        referrer,
        referrerSource,
      ]
    );

    await client.query(
      `UPDATE links
       SET click_count = click_count + 1,
           unique_click_count = unique_click_count + $2
       WHERE id = $1`,
      [linkId, isUnique ? 1 : 0]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
