'use client';

import { useEffect, useRef, useState } from 'react';
import { PageWrapper } from '@/app/components/PageWrapper';
import { createClient } from '@/lib/supabase/client';
import {
  INVALID_RECOVERY_LINK_MESSAGE,
  RECOVERY_SESSION_STORAGE_KEY,
} from '@/lib/auth/recovery';
import { Loader2 } from 'lucide-react';

const INVALID_LINK_MESSAGE = 'Invite link is invalid or has expired. Please contact an administrator.';
const OAUTH_FAILED_MESSAGE =
  'Microsoft sign-in could not be completed. Please try again, or sign in with your email and password.';
const ALLOWED_DESTINATIONS = new Set(['/auth/set-password', '/dashboard']);

/**
 * Landing point for Supabase Auth email links (invite, magic link, password recovery) — see
 * docs/04-rbac-security.md §14.
 *
 * This MUST be a client component, not a Route Handler. Supabase's own /auth/v1/verify endpoint
 * (hit when the user clicks the email link) hands the resulting session back as a URL hash
 * fragment — `#access_token=...&refresh_token=...&type=invite` — not a `?code=` query param.
 * Hash fragments are never sent in the HTTP request, so a server-side route.ts can never see
 * them; only browser JS reading `window.location.hash` can. (A previous route.ts version here
 * only ever checked `?code=`, which is why every single invite link failed with "invalid or
 * expired" regardless of whether it actually was.) `?code=` is still handled as a fallback for
 * any flow that does use PKCE.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Hard navigation (window.location), not router.replace/push: proxy.ts's middleware decides
    // whether to allow /auth/set-password by reading the session cookie on the NEXT request. A
    // client-side router.replace fires that next request immediately after setSession() resolves,
    // but @supabase/ssr's cookie-backed browser client writes those cookies slightly after the
    // promise resolves — the middleware was consistently losing that race and seeing no session
    // yet, silently bouncing to /login (no error text, since it's proxy.ts's plain "not logged
    // in" redirect, not this page's error path). A full navigation only fires once the browser
    // has fully committed the Set-Cookie-equivalent writes from setSession, so the race is gone.
    const goTo = (url: string) => {
      window.location.replace(url);
    };

    const run = async () => {
      const supabase = createClient();
      const search = new URLSearchParams(window.location.search);
      const requestedNext = search.get('next') ?? '/auth/set-password';

      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashError = hashParams.get('error_description') || hashParams.get('error');
      const tokenType = hashParams.get('type');
      const isRecovery =
        tokenType === 'recovery' ||
        search.get('flow') === 'recovery' ||
        requestedNext === '/auth/reset-password';

      const fail = () => {
        sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
        // A ?code= with no hash tokens is an OAuth (Microsoft) return, not an invite or recovery link.
        const isOAuthReturn = !isRecovery && search.has('code') && !accessToken;
        const message = isRecovery
          ? INVALID_RECOVERY_LINK_MESSAGE
          : isOAuthReturn
            ? OAUTH_FAILED_MESSAGE
            : INVALID_LINK_MESSAGE;
        setError(message);
        goTo(
          isRecovery
            ? `/auth/forgot-password?error=${encodeURIComponent(message)}`
            : `/login?error=${encodeURIComponent(message)}`
        );
      };

      // Implicit-flow links identify their purpose in the signed recovery response. Do not allow
      // an invitation or magic-link session to be relabeled as password recovery via query text.
      if (isRecovery && tokenType && tokenType !== 'recovery') {
        fail();
        return;
      }

      if (hashError) {
        fail();
        return;
      }

      let sessionEstablished = false;
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          fail();
          return;
        }
        sessionEstablished = true;
      }

      // OAuth providers (Microsoft) report failures as ?error=...&error_description=... on the callback.
      const oauthError = search.get('error_description') || search.get('error');
      if (oauthError) {
        const message = `Microsoft sign-in failed: ${oauthError.slice(0, 200)}`;
        setError(message);
        goTo(`/login?error=${encodeURIComponent(message)}`);
        return;
      }

      const code = search.get('code');
      if (!sessionEstablished && code) {
        // The browser client auto-detects a ?code= on creation (detectSessionInUrl) and completes the
        // PKCE exchange itself, then deletes the one-time code verifier AND removes `code` from the
        // URL. Wait for that to finish; a second manual exchange would always fail with "code
        // verifier missing" and wrongly report a broken link even though sign-in succeeded.
        await supabase.auth.getSession();
        const codeStillInUrl = new URLSearchParams(window.location.search).get('code');
        if (!codeStillInUrl) {
          // Consumed by the library. getUser() below still verifies the session with Supabase Auth.
          sessionEstablished = true;
        } else {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) {
            sessionEstablished = true;
          }
        }
      }

      if (!sessionEstablished) {
        fail();
        return;
      }

      // Validate the new session with Supabase Auth rather than trusting URL parameters alone.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        fail();
        return;
      }

      if (isRecovery) {
        // A recovery page must be reached through this verified callback, not merely by having an
        // unrelated logged-in session. Store the verified user ID for the next same-tab request.
        sessionStorage.setItem(RECOVERY_SESSION_STORAGE_KEY, userData.user.id);
        goTo('/auth/reset-password');
        return;
      }

      const next = ALLOWED_DESTINATIONS.has(requestedNext) ? requestedNext : '/auth/set-password';
      goTo(next);
    };

    run().catch(() => {
      const search = new URLSearchParams(window.location.search);
      const isRecovery =
        search.get('flow') === 'recovery' || search.get('next') === '/auth/reset-password';
      const message = isRecovery ? INVALID_RECOVERY_LINK_MESSAGE : INVALID_LINK_MESSAGE;
      sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
      window.location.replace(
        isRecovery
          ? `/auth/forgot-password?error=${encodeURIComponent(message)}`
          : `/login?error=${encodeURIComponent(message)}`
      );
    });
  }, []);

  return (
    <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        <p className="text-xs font-semibold text-slate-500">
          {error ?? 'Signing you in...'}
        </p>
      </div>
    </PageWrapper>
  );
}
