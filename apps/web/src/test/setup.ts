import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mswServer.ts';
import { resetDb } from '@/mocks/db.ts';
import { resetPasswordLinks } from '@/mocks/passwordLinks.ts';
import { setMockUserId } from '@/lib/apiClient.ts';
import { useSession } from '@/hooks/useSession.ts';

/**
 * Testing Library's default 1000ms async timeout is far too tight here.
 *
 * The MSW handlers deliberately simulate latency so loading states are real
 * rather than theoretical, and a `findBy*` that waits on two sequential requests
 * has already spent a chunk of its budget before anything renders. Under
 * `--coverage` the v8 instrumentation consumes the rest, so the suite passed
 * bare and failed with coverage — a flake caused by the harness, not by the app.
 *
 * Raised rather than removing the mock latency: the latency is what makes the
 * loading states worth testing at all.
 *
 * 10s, up from 5s. At 5s the analytics screens failed intermittently in the FULL
 * suite while passing in isolation — they are the slowest in the app to become
 * interactive (a lazy Recharts chunk, then three queries), and four workers
 * competing for one core pushed them past the budget. A test that depends on
 * machine load is not testing the app. Still comfortably under
 * `testTimeout: 20_000` in `vitest.config.ts`, which must stay larger so a
 * genuine miss reports the ELEMENT it could not find rather than "test timed
 * out" — see the note there.
 */
configure({ asyncUtilTimeout: 10_000 });

/**
 * jsdom gaps that Radix primitives depend on.
 *
 * Radix Select, Dialog and Tabs use Pointer Events for their press handling and
 * `scrollIntoView` to keep the highlighted option visible. jsdom implements
 * neither, so without these a `userEvent.click` on a Select trigger throws
 * `hasPointerCapture is not a function` and no listbox ever opens — which reads
 * in the failure output as "the option does not exist" rather than as a missing
 * browser API.
 *
 * These are stubs, not implementations: they exist so the component's own logic
 * runs. Anything that genuinely depends on pointer capture or scroll position is
 * verified in Playwright against a real browser instead.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/*
 * jsdom does not implement `window.scrollTo`, and `<ScrollRestoration />` calls
 * it on every navigation.
 *
 * Without this every test that drives the real route table — most of them —
 * prints "Not implemented: window.scrollTo" per navigation, burying real
 * failures in noise. A no-op is honest here: jsdom has no layout and therefore
 * no scroll position, so the behaviour is verified in Playwright instead
 * (`e2e/developer.spec.ts`).
 */
window.scrollTo = () => undefined;
/*
 * jsdom has no `matchMedia`, and `hooks/useMediaQuery` calls it during render.
 *
 * Every chart reads `prefers-reduced-motion` through that hook, because Recharts
 * animates SVG attributes from JavaScript and the global CSS block in
 * `global.css` cannot reach it. Without this stub any screen containing a chart
 * throws before it paints — which surfaces as "cannot find the heading" rather
 * than as a missing browser API.
 *
 * Reports NO match, so tests exercise the animated path — the one real users on
 * default settings get. The reduced-motion path is verified in a real browser.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {
      /* jsdom never resizes anything; nothing to observe. */
    }
    unobserve() {
      /* No-op, for the same reason. */
    }
    disconnect() {
      /* No-op, for the same reason. */
    }
  };
}

/**
 * Every test runs against the real MSW handlers.
 *
 * `onUnhandledRequest: 'error'` is deliberate: a request no handler covers is a
 * gap in the mock API, and failing loudly here is how that gets noticed before
 * the same gap appears against the real backend.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

/**
 * Tests run signed in, the way the app is once `main.tsx` has bootstrapped.
 * Without this the handlers correctly answer 401 and every query fails — right
 * behaviour, but not the scenario most tests mean. Tests that need the
 * signed-out path call `signOutForTest()`.
 */
const TEST_USER_ID = 'u-charith';

export function signInForTest(userId: string = TEST_USER_ID): void {
  try {
    window.localStorage.setItem('sdp.mock-user-id', userId);
  } catch {
    /* jsdom always provides storage; guard is for safety only. */
  }
  setMockUserId(userId);
  useSession.setState({
    userId,
    isAuthenticated: true,
    isChecking: false,
    isExpired: false,
    didExpire: false,
  });
}

export function signOutForTest(): void {
  try {
    window.localStorage.removeItem('sdp.mock-user-id');
    window.sessionStorage.removeItem('sdp.mock-user-id');
  } catch {
    /* jsdom safety */
  }
  setMockUserId(null);
  useSession.setState({
    userId: null,
    isAuthenticated: false,
    isChecking: false,
    isExpired: false,
    didExpire: false,
  });
}

beforeAll(() => {
  signInForTest();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Handlers mutate the in-memory store, so reset it or one test's "mark all
  // read" silently changes the next test's expected counts.
  resetDb();
  resetPasswordLinks();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* jsdom always provides storage; guard is for safety only. */
  }
  signInForTest();
});

afterAll(() => {
  server.close();
});
