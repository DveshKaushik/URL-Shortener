import crypto from 'crypto';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Paths that must never be claimed as short codes / custom aliases */
export const RESERVED_ALIASES = new Set([
  'api',
  'health',
  'test-db',
  'links',
  'analytics',
  'reports',
  'shorten',
  'safety',
  'register',
  'login',
  'me',
]);

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

export function generateShortCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, CHARS.length);
    code += CHARS[randomIndex];
  }
  return code;
}

export function isReservedAlias(code) {
  return RESERVED_ALIASES.has(String(code || '').toLowerCase());
}

/**
 * Normalize and validate a custom alias.
 * @returns {{ ok: true, alias: string } | { ok: false, error: string }}
 */
export function normalizeCustomAlias(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'customAlias must be a string' };
  }

  const alias = raw.trim().toLowerCase();
  if (!alias) {
    return { ok: false, error: 'customAlias cannot be empty' };
  }

  if (alias.length < 3 || alias.length > 64) {
    return { ok: false, error: 'customAlias must be 3–64 characters' };
  }

  if (!ALIAS_PATTERN.test(alias)) {
    return {
      ok: false,
      error:
        'customAlias may only use letters, numbers, hyphens, and underscores',
    };
  }

  if (RESERVED_ALIASES.has(alias)) {
    return { ok: false, error: 'That alias is reserved' };
  }

  return { ok: true, alias };
}
