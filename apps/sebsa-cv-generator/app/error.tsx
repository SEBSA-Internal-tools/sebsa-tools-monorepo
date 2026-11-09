'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';

/**
 * App-wide error boundary (Next.js convention — catches any uncaught error thrown while
 * rendering a Server or Client Component under this layout, e.g. a profile picture that fails to
 * render because its storage object is missing/corrupted). Without this file, Next.js falls back
 * to its own generic production message ("An error occurred in the Server Components render...
 * A digest property is included..."), which tells the user nothing actionable. This replaces
 * that with a clear, specific message plus a retry action.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
        <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-5 mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-slate-900 font-sans leading-tight mb-2">
          Something didn't load correctly
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          This could be a temporary issue, or a file (like a profile photo) that failed to load.
          Try again, or contact an administrator if it keeps happening.
          {error.digest && (
            <span className="block text-[10px] text-slate-400 mt-2 font-mono">Reference: {error.digest}</span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center justify-center gap-1.5 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="flex items-center justify-center gap-1.5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        </div>
      </div>
    </div>
  );
}
