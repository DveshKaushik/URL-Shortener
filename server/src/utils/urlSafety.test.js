import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectUrlLocal } from './urlSafety.js';

describe('inspectUrlLocal', () => {
  it('allows clean https destinations', () => {
    const report = inspectUrlLocal('https://example.com/docs');
    assert.notEqual(report.verdict, 'block');
  });

  it('blocks known malicious hosts', () => {
    const report = inspectUrlLocal('https://malware.testing.google.test/path');
    assert.equal(report.verdict, 'block');
  });

  it('blocks unparseable URLs', () => {
    const report = inspectUrlLocal('not a url');
    assert.equal(report.verdict, 'block');
  });
});
