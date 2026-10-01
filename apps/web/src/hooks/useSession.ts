import { create } from 'zustand';
import { isMockApiEnabled, MOCK_IDENTITY_KEY, setMockUserId } from '@/lib/apiClient.ts';
import { clearUserStorage } from '@/lib/sessionStorage.ts';

interface SessionState {
  userId: string | null;
  isAuthenticated: boolean;
  isChecking: boolean;
  didExpire: boolean;
  isExpired: boolean;
  signIn: (userId: string, remember?: boolean) => void;
  authenticationChecked: (userId: string) => void;
  signOut: (options?: { expired?: boolean; broadcast?: boolean }) => void;
  expireSession: () => void;
  dismissExpiry: () => void;
  acknowledgeExpiry: () => void;
}

const AUTH_EVENT_KEY = 'sdp.auth-event';
function clearMockIdentity(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MOCK_IDENTITY_KEY);
  window.sessionStorage.removeItem(MOCK_IDENTITY_KEY);
}

function storeMockIdentity(userId: string, remember: boolean): void {
  if (!isMockApiEnabled || typeof window === 'undefined') return;
  clearMockIdentity();
  (remember ? window.localStorage : window.sessionStorage).setItem(MOCK_IDENTITY_KEY, userId);
}

function readMockIdentity(): string | null {
  if (!isMockApiEnabled || typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(MOCK_IDENTITY_KEY) ?? window.localStorage.getItem(MOCK_IDENTITY_KEY);
}

export const useSession = create<SessionState>()((set, get) => ({
  userId: null,
  isAuthenticated: false,
  isChecking: true,
  didExpire: false,
  isExpired: false,

  signIn: (userId, remember = false) => {
    storeMockIdentity(userId, remember);
    setMockUserId(userId);
    set({ userId, isAuthenticated: true, isChecking: false, didExpire: false, isExpired: false });
  },

  authenticationChecked: (userId) => {
    setMockUserId(userId);
    set({ userId, isAuthenticated: true, isChecking: false, didExpire: false, isExpired: false });
  },

  signOut: (options) => {
    const expired = options?.expired ?? false;
    const state = get();
    if (!state.isAuthenticated && !state.isChecking && state.didExpire === expired && !state.isExpired) return;
    clearUserStorage();
    clearMockIdentity();
    setMockUserId(null);
    set({ userId: null, isAuthenticated: false, isChecking: false, didExpire: expired, isExpired: false });
    if (options?.broadcast !== false && typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_EVENT_KEY, `${Date.now()}:logout`);
    }
  },

  expireSession: () => {
    if (get().isExpired) return;
    clearUserStorage();
    clearMockIdentity();
    setMockUserId(null);
    set({ userId: null, isAuthenticated: false, isChecking: false, didExpire: true, isExpired: true });
  },

  dismissExpiry: () => set({ isExpired: false }),
  acknowledgeExpiry: () => set({ didExpire: false }),
}));

/** HttpOnly cookies are the source of truth, so every fresh page asks /auth/me. */
export function initialiseSession(): void {
  const mockUserId = readMockIdentity();
  useSession.setState({
    userId: mockUserId,
    isAuthenticated: mockUserId !== null,
    isChecking: true,
    didExpire: false,
    isExpired: false,
  });
  setMockUserId(mockUserId);
  listenForAuthEvents();
}

let listening = false;
function listenForAuthEvents(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_EVENT_KEY && event.newValue?.endsWith(':logout') === true) {
      useSession.getState().signOut({ broadcast: false });
    }
  });
  window.addEventListener('sdp:unauthorized', () => {
    const state = useSession.getState();
    // Returning to an idle tab refetches every stale query at once, so 401s
    // arrive in a burst. The first one expires the session; the rest must not
    // downgrade that to a plain sign-out, which would cancel the expiry screen
    // and the login reminder and bounce the user to the form unexplained.
    if (state.isExpired || (state.didExpire && !state.isAuthenticated)) return;
    if (state.isAuthenticated) state.expireSession();
    else state.signOut();
  });
}
