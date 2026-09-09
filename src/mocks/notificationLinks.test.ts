import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { routes } from '@/app/routes.tsx';
import { db } from './db.ts';

/**
 * Regression guard for a real defect.
 *
 * Every notification `href` pointed at `/crp/developer/tasks/:id` or
 * `/crp/reviewer/tasks/:id`, neither of which had a route. The catch-all redirected
 * all nine of them to the 404 page, so the entire notification panel was a dead
 * end — and nothing in the build, typecheck, lint or test suite noticed.
 *
 * Resolving each seeded href against the real route table means a future edit
 * to `notifications.json`, or a route rename, fails here rather than in a
 * user's hands.
 */
describe('notification deep links', () => {
  const notifications = db.notifications;

  it('seeds notifications to resolve against', () => {
    expect(notifications.length).toBeGreaterThan(0);
  });

  /**
   * Negative control.
   *
   * Twice on this project a green check has turned out to be enforcing nothing.
   * This asserts the detection actually works: a path with no real route must
   * fall through to the catch-all, which is exactly the condition the assertion
   * below treats as failure.
   */
  it('detects a path that has no real route', () => {
    const matches = matchRoutes(routes, '/crp/developer/tasks/t-1/definitely-not-a-route');
    const matchedPaths = (matches ?? []).map((m) => m.route.path);
    expect(matchedPaths).toContain('*');
  });

  it.each(notifications.map((n) => [n.id, n.href] as const))(
    'resolves %s -> %s to a real route',
    (_id, href) => {
      const matches = matchRoutes(routes, href);

      expect(matches, `No route matches "${href}"`).not.toBeNull();

      // A match on the `*` catch-all is not a real match: it is the redirect to
      // /404 that made this bug invisible in the first place.
      const matchedPaths = (matches ?? []).map((m) => m.route.path);
      expect(matchedPaths, `"${href}" only matched the catch-all`).not.toContain('*');
    },
  );
});
