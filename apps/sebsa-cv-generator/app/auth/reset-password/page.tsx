'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PageWrapper } from '@/app/components/PageWrapper';
import PasswordRequirementsList from '@/app/components/PasswordRequirementsList';
import { createClient } from '@/lib/supabase/client';
import { readableAuthError } from '@/lib/auth/errorMessage';
import {
  INVALID_RECOVERY_LINK_MESSAGE,
  RECOVERY_SESSION_STORAGE_KEY,
  updateRecoveryPassword,
  verifyRecoveryUser,
} from '@/lib/auth/recovery';
import { isPasswordValid } from '@/lib/passwordValidation';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

const PASSWORD_UPDATE_FAILED = 'We could not update your password. Request a new reset link and try again.';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const verifyRecoverySession = async () => {
      const expectedUserId = sessionStorage.getItem(RECOVERY_SESSION_STORAGE_KEY);
      const supabase = createClient();
      const verified = await verifyRecoveryUser(supabase.auth, expectedUserId);

      if (!cancelled) {
        setIsRecoverySession(verified);
        setError(verified ? null : INVALID_RECOVERY_LINK_MESSAGE);
        setIsCheckingSession(false);
      }
      if (!verified) sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
    };

    verifyRecoverySession().catch(() => {
      if (!cancelled) {
        setIsRecoverySession(false);
        setError(INVALID_RECOVERY_LINK_MESSAGE);
        setIsCheckingSession(false);
      }
      sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements — check the checklist below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const expectedUserId = sessionStorage.getItem(RECOVERY_SESSION_STORAGE_KEY);
      const result = await updateRecoveryPassword(supabase.auth, expectedUserId, password);

      if (result.status === 'invalid-session') {
        sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
        setIsRecoverySession(false);
        setError(INVALID_RECOVERY_LINK_MESSAGE);
        return;
      }
      if (result.status === 'error') {
        setError(readableAuthError(result.error, PASSWORD_UPDATE_FAILED));
        return;
      }

      sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
      await supabase.auth.signOut({ scope: 'local' });
      window.location.replace(`/login?message=${encodeURIComponent('Your password has been reset. You can now log in with your new password.')}`);
    } catch (updateError) {
      setError(readableAuthError(updateError, PASSWORD_UPDATE_FAILED));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
            <Image src="/images/seb-logo-2.png" alt="Sebsa CV Generator Logo" width={36} height={36} className="object-contain" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 leading-none">SEBSA-CV</h2>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-2 leading-none">Choose a New Password</p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm">
          {isCheckingSession ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
              <p className="text-xs font-semibold text-slate-500">Verifying your reset link...</p>
            </div>
          ) : !isRecoverySession ? (
            <div className="text-center">
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-3 mb-5">{error ?? INVALID_RECOVERY_LINK_MESSAGE}</p>
              <Link href="/auth/forgot-password" className="inline-flex items-center justify-center w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-black transition-colors">
                Request a New Reset Link
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">Enter a new password for your account.</p>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="relative group">
                  <input type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={64} autoComplete="new-password" placeholder="New Password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full h-14 px-4 pr-12 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {password.length > 0 && <PasswordRequirementsList password={password} />}

                <input type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={64} autoComplete="new-password" placeholder="Confirm New Password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans" />

                {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={isLoading} className="w-full h-14 bg-gradient-to-r from-blue-900 to-blue-950 hover:from-indigo-600 hover:to-blue-850 text-white rounded-xl font-sans text-sm font-black shadow-lg shadow-sky-600/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isLoading ? 'Updating...' : 'Update Password'}</span>
                  {!isLoading && <KeyRound className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
