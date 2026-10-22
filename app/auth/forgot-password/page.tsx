'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import { createClient } from '@/lib/supabase/client';
import { PASSWORD_RESET_REQUESTED_MESSAGE, requestPasswordReset } from '@/lib/auth/recovery';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    setLinkError(searchParams.get('error'));
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setLinkError(null);

    try {
      const supabase = createClient();
      await requestPasswordReset(
        supabase.auth,
        email,
        `${window.location.origin}/auth/callback?flow=recovery&next=/auth/reset-password`
      );
    } finally {
      // Always show the same result, including for unknown addresses and rate-limited requests.
      setIsLoading(false);
      setSubmitted(true);
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
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-2 leading-none">Reset Your Password</p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm">
          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-5 mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 mb-2">Check your email</h1>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                {PASSWORD_RESET_REQUESTED_MESSAGE} Check your spam folder if it does not arrive.
              </p>
              <button type="button" onClick={() => setSubmitted(false)} className="w-full h-12 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-black transition-colors">
                Send another link
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                Enter your account email and we will send you a secure, one-time password reset link.
              </p>

              {linkError && <p className="mb-5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">{linkError}</p>}

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="relative group">
                  <input type="email" required autoComplete="email" placeholder="Work Email Address" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full h-14 px-4 pr-12 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans" />
                  <Mail className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                <button type="submit" disabled={isLoading} className="w-full h-14 bg-gradient-to-r from-blue-900 to-blue-950 hover:from-indigo-600 hover:to-blue-850 text-white rounded-xl font-sans text-sm font-black shadow-lg shadow-sky-600/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isLoading ? 'Sending...' : 'Send Reset Link'}</span>
                </button>
              </form>
            </>
          )}

          <Link href="/login" className="mt-6 flex items-center justify-center gap-2 text-xs font-black text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
