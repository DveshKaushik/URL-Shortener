import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateShortCode,
  isReservedAlias,
  normalizeCustomAlias,
} from './shortCode.js';

describe('generateShortCode', () => {
  it('returns alphanumeric codes of the requested length', () => {
    const code = generateShortCode(7);
    assert.equal(code.length, 7);
    assert.match(code, /^[A-Za-z0-9]+$/);
  });

  it('produces varied output', () => {
    const codes = new Set(Array.from({ length: 40 }, () => generateShortCode()));
    assert.ok(codes.size > 1);
  });
});

describe('normalizeCustomAlias', () => {
  it('normalizes valid aliases', () => {
    const result = normalizeCustomAlias(' MyPortfolio ');
    assert.equal(result.ok, true);
    assert.equal(result.alias, 'myportfolio');
  });

  it('rejects reserved aliases including safety and reports', () => {
    assert.equal(normalizeCustomAlias('safety').ok, false);
    assert.equal(normalizeCustomAlias('reports').ok, false);
    assert.equal(normalizeCustomAlias('health').ok, false);
    assert.equal(isReservedAlias('ANALYTICS'), true);
  });

  it('rejects invalid characters and length', () => {
    assert.equal(normalizeCustomAlias('ab').ok, false);
    assert.equal(normalizeCustomAlias('bad alias').ok, false);
    assert.equal(normalizeCustomAlias('-leading').ok, false);
  });
});
