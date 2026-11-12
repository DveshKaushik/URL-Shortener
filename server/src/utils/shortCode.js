const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const RESERVED_ALIASES = new Set([
  'api',
  'test-db',
  'links',
  'analytics',
  'shorten',
  'register',
  'login',
  'me',
]);

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

export function generateShortCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * CHARS.length);
    code += CHARS[randomIndex];
  }
  return code;
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