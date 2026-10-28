'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * The button is hidden until Microsoft sign-in is switched on for the environment
 * (NEXT_PUBLIC_SSO_MICROSOFT_ENABLED=true) so a deployment whose Supabase project has not been
 * configured yet never shows a button that cannot work. NEXT_PUBLIC_* values are inlined at build
 * time, so changing it on Vercel needs a redeploy. See docs/sso-microsoft.md.
 */
export const isMicrosoftSsoEnabled = () => process.env.NEXT_PUBLIC_SSO_MICROSOFT_ENABLED === 'true';

interface MicrosoftSignInButtonProps {
  /** Where to land after sign-in. Must be a path on this site. */
  next?: string;
  onError?: (message: string) => void;
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function MicrosoftSignInButton({ next = '/dashboard', onError }: MicrosoftSignInButtonProps) {
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const supabase = createClient();
    // Drop any stale session first. Otherwise, if the Microsoft sign-in fails on the way back, the
    // old session would still be there and the failure would look like a successful login as the
    // previous user. scope 'local' only clears this browser.
    await supabase.auth.signOut({ scope: 'local' });
    // `email` is required: Supabase must receive a verified address from Entra to match the account.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email',
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser is already navigating to Microsoft; only failures return here.
    if (error) {
      setBusy(false);
      onError?.(error.message);
    }
  };

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      className="w-full h-14 flex items-center justify-center gap-3 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl bg-white text-slate-800 text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <MicrosoftLogo />}
      {busy ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
    </button>
  );
}
