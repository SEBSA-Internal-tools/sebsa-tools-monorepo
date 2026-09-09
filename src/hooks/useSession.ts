import { create } from 'zustand';
import { setMockUserId } from '@/lib/apiClient.ts';
import {
  clearSession,
  readSession,
  renewSession,
  writeSession,
  SESSION_STORAGE_KEY,
} from '@/lib/sessionStorage.ts';

/**
 * The Phase 1 session.
 *
 * Holds only WHICH user is signed in, and whether the session ended because it
 * expired. The profile itself comes from `GET /api/auth/me`, exactly as it will
 * in Phase 2, so there is no second copy of the user to fall out of sync.
 *
 * The envelope in storage (`lib/sessionStorage.ts`) is the source of truth for
 * identity and expiry. This store mirrors it for React; it never diverges,
 * because every path that changes one changes the other.
 *
 * Phase 2 replaces the body of `signIn`/`signOut` with the OIDC redirect and
 * token handling. The rest of the app talks to `useSession` either way.
 */

interface SessionState {
  userId: string | null;
  isAuthenticated: boolean;
  /**
   * True when the session ended by timing out rather than by the user signing
   * out. Drives the "session expired" NOTICE above the login form — being signed
   * out on purpose and being timed out deserve different words.
   */
  didExpire: boolean;
  /**
   * True while the expiry needs EXPLAINING, before the user has acknowledged it.
   *
   * Separate from `didExpire` because they drive two different surfaces at two
   * different moments: this one blocks the app with `SessionExpiredScreen` so the
   * user is told what happened and why, while `didExpire` is the lighter reminder
   * they meet on the login form afterwards. Dismissing the screen clears this and
   * keeps that, which is why one flag could not do both.
   */
  isExpired: boolean;
  signIn: (userId: string, remember: boolean) => void;
  signOut: (options?: { expired?: boolean }) => void;
  /**
   * Ends the session because its deadline passed.
   *
   * Purges immediately rather than waiting for the user to acknowledge: leaving a
   * dead session's data in storage while a screen explains that it is dead is the
   * worst of both. By the time the screen renders there is nothing left to leak.
   */
  expireSession: () => void;
  /** Dismisses the expiry screen. Keeps `didExpire` for the login notice. */
  dismissExpiry: () => void;
  /** Clears the expired flag once the login-form notice has been shown. */
  acknowledgeExpiry: () => void;
}

export const useSession = create<SessionState>()((set, get) => ({
  userId: null,
  isAuthenticated: false,
  didExpire: false,
  isExpired: false,

  signIn: (userId, remember) => {
    writeSession(userId, remember);
    setMockUserId(userId);
    set({ userId, isAuthenticated: true, didExpire: false, isExpired: false });
    armExpiryTimer();
  },

  signOut: (options) => {
    const didExpire = options?.expired ?? false;

    /*
     * IDEMPOTENT. Returning early when nothing would change is not a
     * micro-optimisation — it is a guard against a real crash.
     *
     * `RootLayout` used to call this from its render body on a 401. Zustand's
     * `set` notifies `RequireAuth`, which subscribes to this same store from
     * ABOVE, so the write invalidated a component that had already rendered;
     * and because the 401 was still there on the next pass, it fired again every
     * render until React threw and the route boundary showed "This page ran into
     * a problem". That call site is now an effect, but a setter that is safe to
     * call twice closes the whole class of bug off for good.
     */
    const state = get();
    const alreadyDone =
      !state.isAuthenticated &&
      state.userId === null &&
      state.didExpire === didExpire &&
      !state.isExpired;
    if (alreadyDone) return;

    clearSession();
    setMockUserId(null);
    clearExpiryTimer();
    set({ userId: null, isAuthenticated: false, didExpire, isExpired: false });
  },

  expireSession: () => {
    // Same idempotence guard, for the same reason: the timer and the 401 effect
    // can both notice the same expiry.
    if (get().isExpired) return;

    clearSession();
    setMockUserId(null);
    clearExpiryTimer();
    set({
      userId: null,
      isAuthenticated: false,
      didExpire: true,
      isExpired: true,
    });
  },

  dismissExpiry: () => {
    set({ isExpired: false });
  },

  acknowledgeExpiry: () => {
    set({ didExpire: false });
  },
}));

/* -------------------------------------------------------------------------- */
/* Expiry                                                                      */
/* -------------------------------------------------------------------------- */

let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function clearExpiryTimer(): void {
  if (expiryTimer !== undefined) clearTimeout(expiryTimer);
  expiryTimer = undefined;
}

/**
 * Fires `expireSession()` at the session deadline.
 *
 * Needed because expiry would otherwise only ever be noticed on the next boot —
 * nothing re-reads storage while the app is open. The timer is re-armed on each
 * renewal, so an active user's deadline keeps moving and this never fires.
 *
 * `setTimeout` is not trusted on its own: a laptop that sleeps through the
 * deadline fires it late, and a throttled background tab fires it later still.
 * That is fine, because `readSession()` re-checks the wall clock and is the real
 * gate — the timer only makes expiry *visible* promptly when the app is in use.
 */
function armExpiryTimer(): void {
  clearExpiryTimer();
  if (typeof window === 'undefined') return;

  const session = readSession();
  if (session === null) return;

  const remaining = Math.max(0, session.expiresAt - Date.now());
  expiryTimer = setTimeout(() => {
    // Re-read rather than trusting the timer: a renewal may have landed after
    // this callback was scheduled.
    if (readSession() === null) useSession.getState().expireSession();
    else armExpiryTimer();
  }, remaining);
}

/**
 * Slides the deadline forward and re-arms the timer.
 *
 * Called from the app shell on user activity. `renewSession` throttles the
 * storage write, and returns the new deadline only when it actually wrote — so
 * the timer is re-armed exactly as often as the deadline really moves.
 */
export function touchSession(): void {
  if (!useSession.getState().isAuthenticated) return;
  if (renewSession() !== null) armExpiryTimer();
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Restores a persisted session before React renders.
 *
 * An expired envelope is dropped by `readSession()`, so a stale session can
 * never be restored — which is the whole point of storing an expiry rather than
 * a bare user id.
 */
export function initialiseSession(): void {
  const session = readSession();

  if (session === null) {
    setMockUserId(null);
    return;
  }

  setMockUserId(session.userId);
  useSession.setState({
    userId: session.userId,
    isAuthenticated: true,
    didExpire: false,
    isExpired: false,
  });
  armExpiryTimer();

  listenForCrossTabSignOut();
}

let isListeningForStorage = false;

/**
 * Signing out in one tab signs out the others.
 *
 * Without this, a second tab keeps rendering an authenticated shell while every
 * request it makes is anonymous — the same class of "UI and reality disagree"
 * bug this whole change is about.
 */
function listenForCrossTabSignOut(): void {
  if (isListeningForStorage || typeof window === 'undefined') return;
  isListeningForStorage = true;

  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_STORAGE_KEY) return;
    // `newValue === null` means the key was removed — a sign-out or an expiry.
    if (event.newValue === null && useSession.getState().isAuthenticated) {
      useSession.getState().signOut();
    }
  });
}
