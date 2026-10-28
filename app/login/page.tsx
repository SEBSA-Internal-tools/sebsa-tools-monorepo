'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from "next/image";
import { useRouter, useSearchParams } from 'next/navigation';
import { PageWrapper } from '../components/PageWrapper';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import LightRays from '../components/LightRays';
import MicrosoftSignInButton, { isMicrosoftSsoEnabled } from '../components/MicrosoftSignInButton';
import { Mail, Eye, EyeOff, LogIn, CheckCircle, ShieldCheck, TrendingUp, Sparkles, BrainCircuit, Loader2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Surfaces failures from /auth/callback (e.g. an expired or already-used invite link) instead
  // of silently dropping the person on a blank login form with no explanation.
  useEffect(() => {
    const callbackError = searchParams?.get('error');
    if (callbackError) setError(callbackError);
    setMessage(searchParams?.get('message') ?? null);
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setIsLoading(false);
      setError(signInError.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <PageWrapper className="min-h-screen w-full flex flex-col md:flex-row bg-[#fbf9fb]">
      {/* Left Column: Premium HR AI Graphics & Trust indicators */}
     <section className="hidden md:flex md:w-1/2 bg-gradient-to-br from-black/90 to-blue-900  relative overflow-hidden items-center justify-center p-12">
        {/* Particle Background */}
        <div className="absolute inset-0 z-0">
          <LightRays
              raysOrigin="top-center"
              raysColor="#2ffafa"
              raysSpeed={0.9}
              lightSpread={0.6}
              rayLength={3}
              followMouse={true}
              mouseInfluence={0.1}
              noiseAmount={0}
              distortion={0}
              className="custom-rays"
              pulsating={false}
              fadeDistance={2}
              saturation={2}
          />
        </div>
        {/* Subtle radial glows */}
        <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none">
          <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-sky-500/10 blur-[150px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
        </div>

        {/* Content Box */}
        <div className="relative z-10 max-w-lg text-white text-center flex flex-col items-center">
          <div className="mb-6">
          <Image
            src="/images/seb-logo-1.png"
            alt="AI CV Generator"
            width={180}
            height={180}
          />
        </div>
          <h1 className="text-3xl font-black tracking-tight mb-4 text-slate-100 font-sans leading-tight">
            Smarter Resumes <br></br> Better Opportunities
          </h1>
          <p className="text-sm text-slate-300 font-medium leading-relaxed max-w-md opacity-90 mb-10">
            Transform your career profile into a professional resume with AI-driven content recommendations and customizable templates designed to help you succeed.
          </p>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-6 text-slate-300 font-sans">
            <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 px-3.5 py-2 rounded-xl backdrop-blur-sm">
              <CheckCircle className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Content Enhancement</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 px-3.5 py-2 rounded-xl backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Customizable Templates</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 px-3.5 py-2 rounded-xl backdrop-blur-sm">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Export-Ready CVs</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Column: Portal Login Form */}
      <section className="flex-1 flex flex-col items-center justify-center p-8 md:p-12 bg-white">
        <div className="w-full max-w-[400px]">
          {/* Header Brand */}
          <div className="flex flex-col items-center text-center mb-10">
           <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 hover:scale-105 transition-transform duration-300">
              <Image
                src="/images/seb-logo-2.png"
                alt="Sebsa CV Generator Logo"
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 leading-none">
              SEBSA-CV
            </h2>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-2 leading-none">
              Internal User Login
            </p>
          </div>

          {/* Microsoft SSO (shown only when enabled for this environment) */}
          {isMicrosoftSsoEnabled() && (
            <div className="mb-6">
              <MicrosoftSignInButton next="/dashboard" onError={setError} />
              <div className="flex items-center gap-3 mt-6">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">or use email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            </div>
          )}

          {/* Form */}
          <form className="space-y-5" onSubmit={handleLogin}>
            {/* Work Email field */}
            <div className="relative group">
              <input
                type="email"
                required
                placeholder="Work Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-14 px-4 border border-slate-200 hover:border-slate-300 rounded-xl bg-slate-50/50 text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all font-sans"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Mail className="w-5 h-5" />
              </div>
            </div>

            {/* Secure Password field */}
            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Secure Password"
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

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-slate-800 focus:ring-slate-500 h-4 w-4"
                />
                <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-800 transition-colors">
                  Remember Me
                </span>
              </label>
              <Link href="/auth/forgot-password" className="text-xs font-black text-slate-900 hover:underline">
                Forgot password?
              </Link>
            </div>

            {/* Auth error */}
            {error && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {message && !error && (
              <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-lg px-3 py-2">
                {message}
              </p>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-gradient-to-r from-blue-900 to-blue-950 hover:from-indigo-600 hover:to-blue-850 text-white rounded-xl font-sans text-sm font-black shadow-lg shadow-sky-600/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <span>{isLoading ? 'Verifying Profile...' : 'Login to Portal'}</span>
              {!isLoading && <LogIn className="w-4 h-4" />}
            </button>

            {/* SSO Divider */}
            <div className="relative py-4 flex items-center">
              <div className="flex-grow border-t border-slate-200/90"></div>
            </div>
          </form>

          {/* Footer Info */}
          <footer className="mt-12 text-center text-xs font-medium text-slate-500">
            <p>
              New employee?{' '}
              <Link href="/signup" className="text-slate-900 font-black hover:underline">
                Create your account
              </Link>
            </p>
            <div className="mt-6 flex justify-center gap-4 text-[11px] text-slate-400">
              <a href="#" className="hover:text-slate-600 transition-colors">
                Privacy Policy
              </a>
              <span>•</span>
              <a href="#" className="hover:text-slate-600 transition-colors">
                Terms of Service
              </a>
            </div>
          </footer>
        </div>
      </section>
    </PageWrapper>
  );
}
