'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { TailoredCv } from './types';

interface GeneratedCvPreviewProps {
  /** The template ID to use for rendering. Pass null to show an empty placeholder. */
  templateId: string | null;
  /** The AI-generated tailored CV data to fill into the template. */
  tailoredCv: TailoredCv | null;
  /** Optional URL of the employee's profile avatar. */
  avatarUrl?: string | null;
  /** Optional extra CSS classes for the outer wrapper. */
  className?: string;
}

/**
 * GeneratedCvPreview renders the *filled* customized DOCX output (not the raw template)
 * via Microsoft Office Online Viewer.
 *
 * Flow:
 *   1. POSTs { templateId, tailoredCv, avatarUrl } to /api/templates/generate-preview
 *   2. The server fills template placeholders, uploads a temp DOCX to Supabase Storage,
 *      and returns a 10-minute signed URL.
 *   3. This component embeds that signed URL in an <iframe> via the Office Online Viewer.
 *
 * The preview automatically regenerates whenever tailoredCv or templateId changes
 * (debounced by 800 ms to avoid rapid successive calls during chat refinements).
 */
export default function GeneratedCvPreview({
  templateId,
  tailoredCv,
  avatarUrl,
  className = '',
}: GeneratedCvPreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable reference for debounce cleanup
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the most recent request to ignore stale responses
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Clear any pending debounce from a previous render
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!templateId || !tailoredCv) {
      setSignedUrl(null);
      setError(null);
      setGenerating(false);
      return;
    }

    // Debounce: wait 800 ms after the last change before calling the API
    debounceRef.current = setTimeout(async () => {
      const currentRequestId = ++requestIdRef.current;

      setGenerating(true);
      setIframeLoading(true);
      setError(null);
      setSignedUrl(null);

      try {
        const res = await fetch('/api/templates/generate-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, tailoredCv, avatarUrl: avatarUrl ?? null }),
        });

        // Ignore response if a newer request has been issued
        if (currentRequestId !== requestIdRef.current) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Preview generation failed (HTTP ${res.status})`);
        }

        const data = await res.json();

        if (currentRequestId !== requestIdRef.current) return;

        if (!data.signedUrl) {
          throw new Error('No signed URL was returned by the server.');
        }

        setSignedUrl(data.signedUrl);
      } catch (err: any) {
        if (currentRequestId !== requestIdRef.current) return;
        console.error('GeneratedCvPreview error:', err);
        setError(err.message || 'Failed to generate the customized CV preview.');
        setIframeLoading(false);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setGenerating(false);
        }
      }
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [templateId, tailoredCv, avatarUrl]);

  // ── Empty / placeholder state ────────────────────────────────────────────────
  if (!templateId || !tailoredCv) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-slate-400 gap-3 p-12 w-full h-[600px] ${className}`}
      >
        <span className="text-xs font-semibold">
          {!templateId ? 'Select a template to see preview' : 'Generate a CV first to see preview'}
        </span>
      </div>
    );
  }

  // Office Online Viewer URL
  const viewerUrl = signedUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`
    : '';

  // Resolve height: respect any h-*/min-h-* class passed in; otherwise default to h-[600px]
  const hasHeightClass = className.split(' ').some((c) => c.startsWith('h-') || c.startsWith('min-h-'));
  const heightStyle = hasHeightClass ? '' : 'h-[600px]';

  return (
    <div
      className={`relative w-full flex flex-col bg-white rounded-xl overflow-hidden border border-slate-200/80 shadow-sm ${heightStyle} ${className}`}
    >
      {/* ── Generating / loading overlay ─────────────────────────────────── */}
      {(generating || iframeLoading) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/96 backdrop-blur-sm z-10 gap-4">
          <div className="relative">
            <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs font-black text-slate-700 tracking-wide">
              {generating ? 'Building your customized CV…' : 'Loading document preview…'}
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
              {generating
                ? 'Filling template placeholders with AI-generated content'
                : 'Microsoft Office Online is rendering the document'}
            </p>
          </div>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center bg-slate-50/50">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <div className="space-y-1.5">
            <p className="text-xs font-black text-rose-700 uppercase tracking-wider">
              Preview failed
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">{error}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Retry button */}
            <button
              onClick={() => {
                // Force a re-render by clearing the error and re-triggering the effect
                setError(null);
                setSignedUrl(null);
                requestIdRef.current++;
                const id = requestIdRef.current;
                setGenerating(true);
                setIframeLoading(true);
                fetch('/api/templates/generate-preview', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ templateId, tailoredCv, avatarUrl: avatarUrl ?? null }),
                })
                  .then(async (res) => {
                    if (id !== requestIdRef.current) return;
                    if (!res.ok) {
                      const e = await res.json().catch(() => ({}));
                      throw new Error(e.error || 'Retry failed');
                    }
                    return res.json();
                  })
                  .then((data) => {
                    if (id !== requestIdRef.current) return;
                    if (data?.signedUrl) setSignedUrl(data.signedUrl);
                    else throw new Error('No signed URL returned');
                  })
                  .catch((err) => {
                    if (id !== requestIdRef.current) return;
                    setError(err.message || 'Retry failed');
                    setIframeLoading(false);
                  })
                  .finally(() => {
                    if (id === requestIdRef.current) setGenerating(false);
                  });
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[10px] transition-colors cursor-pointer border border-indigo-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Preview</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Office Online Viewer iframe ───────────────────────────────────── */}
      {signedUrl && !error && (
        <iframe
          key={signedUrl} // Re-mount iframe when URL changes to force a fresh load
          src={viewerUrl}
          title="Customized CV Preview"
          className="w-full h-full border-0 flex-1"
          onLoad={() => setIframeLoading(false)}
        />
      )}

      {/* ── Footer bar (shown after successful load) ─────────────────────── */}
      {signedUrl && !error && !iframeLoading && (
        <div className="py-2.5 px-4 bg-gradient-to-r from-indigo-50 to-slate-50 border-t border-indigo-100/60 flex items-center text-[10px] text-slate-500 font-semibold shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live preview — AI-customized content</span>
          </div>
        </div>
      )}
    </div>
  );
}
