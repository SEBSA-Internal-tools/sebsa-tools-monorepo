'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../components/PageWrapper';
import PasswordRequirementsList from '../components/PasswordRequirementsList';
import { createClient } from '@/lib/supabase/client';
import { isPasswordValid } from '@/lib/passwordValidation';
import { Mail, Eye, EyeOff, UserPlus, CheckCircle2 } from 'lucide-react';

// Until Microsoft SSO is wired in (docs/04-rbac-security.md §8), self-signup is restricted to
// real SEBSA work emails in firstname.lastname@sebsaworld.com form — keeps the employee directory
// consistent and prevents junk/duplicate accounts.
const SEBSA_WORK_EMAIL = /^[a-z]+\.[a-z]+@sebsaworld\.com$/i;

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!SEBSA_WORK_EMAIL.test(email.trim())) {
      setError('Please use your SEBSA work email, in firstname.lastname@sebsaworld.com format.');
      return;
    }
    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements — check the checklist below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setIsLoading(false);
      setError(signUpError.message);
      return;
    }

    // Every new signup gets role='employee' automatically (handle_new_user trigger, 0002).
    if (data.session) {
      // Email confirmation is off for this Supabase project — session is active immediately.
      router.push('/onboarding');
      router.refresh();
    } else {
      // Email confirmation is required — they'll get a session on first login after confirming.
      setIsLoading(false);
      setAwaitingConfirmation(true);
    }
  };

  if (awaitingConfirmation) {
    return (
      <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-5 mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 font-sans leading-tight mb-2">
            Check your email
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            We sent a confirmation link to <span className="font-bold text-slate-700">{email}</span>.
            Confirm your address, then log in to set up your profile.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-sans text-sm font-black transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </PageWrapper>
    );
  }

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
            Create Your Account
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm">
          <form className="space-y-5" onSubmit={handleSignup}>
            <div className="relative group">
              <input
                type="text"
                required
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans"
              />
            </div>

            <div className="relative group">
              <input
                type="email"
                required
                placeholder="firstname.lastname@sebsaworld.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Mail className="w-5 h-5" />
              </div>
            </div>

            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={64}
                autoComplete="new-password"
                placeholder="Password"
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
              <span>{isLoading ? 'Creating account...' : 'Create Account'}</span>
              {!isLoading && <UserPlus className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed">
            Creating an account gives you Employee access — you'll set up your profile next.
            Admin, Super Admin, and CV Reviewer accounts are provisioned separately.
          </p>
        </div>

        <p className="mt-8 text-center text-xs font-medium text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-slate-900 font-black hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </PageWrapper>
  );
}
