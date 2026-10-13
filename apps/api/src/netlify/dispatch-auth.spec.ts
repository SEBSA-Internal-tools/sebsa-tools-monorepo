import { describe, expect, it } from 'vitest';
import { isAuthorisedDispatch } from './dispatch-auth.js';

describe('background email authorization', () => {
  const secret = 'a'.repeat(48);
  it('accepts only the exact bearer secret', () => {
    expect(isAuthorisedDispatch(`Bearer ${secret}`, secret)).toBe(true);
    for (const value of [undefined, null, '', secret, `Bearer ${'b'.repeat(48)}`]) {
      expect(isAuthorisedDispatch(value, secret)).toBe(false);
    }
  });
  it('refuses a missing/short configured secret', () => {
    expect(isAuthorisedDispatch('Bearer ', '')).toBe(false);
    expect(isAuthorisedDispatch('Bearer short', 'short')).toBe(false);
  });
});
