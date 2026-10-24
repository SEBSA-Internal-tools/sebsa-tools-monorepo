import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';
import { useSession } from '@/hooks/useSession.ts';
import { useLogout } from '@/features/auth/api/queries.ts';

export const ACTIVITY_STORAGE_KEY = 'sdp.last-activity';
export const DEFAULT_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 14,400,000 ms (4 hours)
export const DEFAULT_WARNING_MS = (3 * 60 + 45) * 60 * 1000; // 13,500,000 ms (3h 45m)
const THROTTLE_ACTIVITY_MS = 2000; // Throttle localstorage broadcast to 2s
const CHECK_INTERVAL_MS = 1000; // Evaluate elapsed idle time every 1s

const touchResponseSchema = z.object({
  ok: z.boolean(),
});

export function getIdleConfig() {
  const envTtl = Number(import.meta.env['VITE_SESSION_IDLE_TTL_SECONDS']);
  const envWarning = Number(import.meta.env['VITE_SESSION_IDLE_WARNING_SECONDS']);

  const idleTtlMs = Number.isSafeInteger(envTtl) && envTtl > 0 ? envTtl * 1000 : DEFAULT_IDLE_TTL_MS;
  const warningMs =
    Number.isSafeInteger(envWarning) && envWarning > 0 ? envWarning * 1000 : DEFAULT_WARNING_MS;

  return { idleTtlMs, warningMs };
}

export function useIdleSession() {
  const isAuthenticated = useSession((s) => s.isAuthenticated);
  const expireSession = useSession((s) => s.expireSession);
  const logout = useLogout();
  const location = useLocation();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(900);

  const lastActivityRef = useRef<number>(Date.now());
  const lastBroadcastRef = useRef<number>(0);

  const { idleTtlMs, warningMs } = getIdleConfig();

  // Record user activity
  const recordActivity = useCallback(
    (broadcast = true) => {
      const now = Date.now();
      lastActivityRef.current = now;
      setIsWarningOpen(false);

      if (broadcast && typeof window !== 'undefined' && now - lastBroadcastRef.current >= THROTTLE_ACTIVITY_MS) {
        lastBroadcastRef.current = now;
        try {
          window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        } catch {
          /* Storage write fails silently in private browsing or quota limits */
        }
      }
    },
    [],
  );

  // Continue session action
  const continueSession = useCallback(async () => {
    recordActivity(true);
    setIsWarningOpen(false);
    try {
      await api.post('/auth/touch', touchResponseSchema);
    } catch {
      // If the session has already expired on the server, the touch call will 401
      // and apiClient will dispatch sdp:unauthorized, triggering the expiry screen.
    }
  }, [recordActivity]);

  // Sign out action
  const handleSignOut = useCallback(() => {
    setIsWarningOpen(false);
    logout.mutate();
  }, [logout]);

  // Track meaningful route changes as user activity
  useEffect(() => {
    if (isAuthenticated) {
      recordActivity(true);
    }
  }, [location.pathname, location.search, isAuthenticated, recordActivity]);

  // Listen to cross-tab storage events and user interactions
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    // Listen to meaningful interaction events only:
    // pointerdown (clicks, taps) and keydown (typing).
    // Intentionally EXCLUDES mousemove and scroll.
    const handleUserInteraction = () => {
      recordActivity(true);
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === ACTIVITY_STORAGE_KEY && event.newValue) {
        const remoteTimestamp = Number(event.newValue);
        if (Number.isFinite(remoteTimestamp) && remoteTimestamp > lastActivityRef.current) {
          lastActivityRef.current = remoteTimestamp;
          setIsWarningOpen(false);
        }
      }
    };

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [isAuthenticated, recordActivity]);

  // Evaluation interval
  useEffect(() => {
    if (!isAuthenticated) {
      setIsWarningOpen(false);
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityRef.current;

      if (idleTime >= idleTtlMs) {
        setIsWarningOpen(false);
        expireSession();
        logout.mutate();
      } else if (idleTime >= warningMs) {
        setIsWarningOpen(true);
        const remaining = Math.max(0, Math.ceil((idleTtlMs - idleTime) / 1000));
        setRemainingSeconds(remaining);
      } else {
        setIsWarningOpen(false);
      }
    }, CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isAuthenticated, idleTtlMs, warningMs, expireSession, logout]);

  return {
    isWarningOpen,
    remainingSeconds,
    continueSession,
    signOut: handleSignOut,
  };
}
