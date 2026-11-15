import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validatePassword,
} from './authValidation.js';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    const result = normalizeEmail('  Dev@Example.COM ');
    assert.equal(result.ok, true);
    assert.equal(result.email, 'dev@example.com');
  });

  it('rejects missing email', () => {
    assert.equal(normalizeEmail('').ok, false);
    assert.equal(normalizeEmail(null).ok, false);
  });

  it('rejects invalid shape', () => {
    assert.equal(normalizeEmail('not-an-email').ok, false);
    assert.equal(normalizeEmail('a@b').ok, false);
  });

  it('rejects disposable domains when asked', () => {
    const result = normalizeEmail('user@mailinator.com', {
      rejectDisposable: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Disposable/i);
  });

  it('allows disposable domains on login path', () => {
    const result = normalizeEmail('user@mailinator.com');
    assert.equal(result.ok, true);
  });
});

describe('validatePassword', () => {
  it(`requires at least ${MIN_PASSWORD_LENGTH} chars with letter and number`, () => {
    assert.equal(validatePassword('short1').ok, false);
    assert.equal(validatePassword('onlyletters').ok, false);
    assert.equal(validatePassword('12345678').ok, false);
    assert.equal(validatePassword('goodpass1').ok, true);
  });
});
