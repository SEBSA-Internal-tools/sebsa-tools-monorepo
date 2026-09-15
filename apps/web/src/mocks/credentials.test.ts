import { describe, expect, it } from 'vitest';
import credentials from './data/credentials.json';
import loginContent from '@/content/login.json';
import { db } from './db.ts';

/**
 * Keeps the demo credentials and the seeded users in step.
 *
 * An email listed in one file but not the other silently produces an account
 * that cannot sign in — the exact failure that is hardest to diagnose from the
 * UI, because a correct-looking address just returns "Invalid email or
 * password".
 */
describe('demo credentials', () => {
  it('defines a password', () => {
    expect(credentials.password.length).toBeGreaterThan(0);
  });

  it('lists every seeded user, so no account is unreachable', () => {
    const seeded = db.users.map((u) => u.email.toLowerCase()).sort();
    const listed = credentials.emails.map((e) => e.toLowerCase()).sort();
    expect(listed).toEqual(seeded);
  });

  it('has no duplicate emails', () => {
    const listed = credentials.emails.map((e) => e.toLowerCase());
    expect(new Set(listed).size).toBe(listed.length);
  });

  /**
   * The hint on the login page spells the password out literally, because
   * application code must not import from `mocks/`. This is what stops the two
   * drifting apart and leaving the screen advertising a password that no longer
   * works.
   */
  it('advertises the real password on the login page', () => {
    expect(loginContent.demoHint).toContain(credentials.password);
  });
});
