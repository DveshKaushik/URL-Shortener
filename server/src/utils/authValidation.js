import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const disposableDomains = require('disposable-email-domains');

const DISPOSABLE = new Set(disposableDomains);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Normalize and validate an email address for register/login.
 * @param {string} raw
 * @param {{ rejectDisposable?: boolean }} [options]
 * @returns {{ ok: true, email: string } | { ok: false, error: string }}
 */
export function normalizeEmail(raw, { rejectDisposable = false } = {}) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Email is required' };
  }

  const email = raw.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Email is required' };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }

  if (rejectDisposable) {
    const domain = email.split('@')[1];
    if (DISPOSABLE.has(domain)) {
      return { ok: false, error: 'Disposable email addresses are not allowed' };
    }
  }

  return { ok: true, email };
}

/**
 * Validate password strength for registration.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePassword(raw) {
  if (typeof raw !== 'string' || !raw) {
    return { ok: false, error: 'Password is required' };
  }
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  if (raw.length > 128) {
    return { ok: false, error: 'Password must be 128 characters or fewer' };
  }
  if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) {
    return {
      ok: false,
      error: 'Password must include at least one letter and one number',
    };
  }
  return { ok: true };
}
