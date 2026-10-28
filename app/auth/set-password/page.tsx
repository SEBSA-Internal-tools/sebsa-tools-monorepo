'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PageWrapper } from '@/app/components/PageWrapper';
import PasswordRequirementsList from '@/app/components/PasswordRequirementsList';
import { createClient } from '@/lib/supabase/client';
import { readableAuthError } from '@/lib/auth/errorMessage';
import { isPasswordValid } from '@/lib/passwordValidation';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

const INVALID_ACTIVATION_SESSION =
  'Your activation session is invalid or has expired. Please request a new activation email and try again.';
const PASSWORD_UPDATE_FAILED =
  'We could not save your password. Please request a new activation email or contact the system administrator.';

/**
 * Landing page after an invited employee clicks their invite email link (see
 * app/auth/callback/page.tsx and docs/04-rbac-security.md §14). The callback page has already
 * exchanged the invite link for a session, so this page just needs the employee to pick their
 * own password — Supabase never puts a password in the invite email itself.
 */
export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      // Verify the invite-created session with the Auth server immediately before changing the
      // password. The page may have remained open after that session expired or been invalidated.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setError(readableAuthError(userError, INVALID_ACTIVATION_SESSION));
        return;
      }

      const { data: updateData, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError || !updateData.user) {
        setError(readableAuthError(updateError, PASSWORD_UPDATE_FAILED));
        return;
      }

      // Use a full navigation so the dashboard request observes the cookie-backed session after
      // Supabase finishes persisting it, matching the callback page's session hand-off behavior.
      window.location.replace('/dashboard');
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
            <Image
              src="/images/seb-logo-2.png"
              alt="Sebsa CV Generator Logo"
              width={36}
              height={36}
              className="object-contain"
            />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 leading-none">SEBSA-CV</h2>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-2 leading-none">
            Set Your Password
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Welcome! Choose a password for your account. You can change it again later from your profile.
          </p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={64}
                autoComplete="new-password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {password.length > 0 && <PasswordRequirementsList password={password} />}

            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={64}
                autoComplete="new-password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-gradient-to-r from-blue-900 to-blue-950 hover:from-indigo-600 hover:to-blue-850 text-white rounded-xl font-sans text-sm font-black shadow-lg shadow-sky-600/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{isLoading ? 'Saving...' : 'Save Password & Continue'}</span>
              {!isLoading && <KeyRound className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
}
