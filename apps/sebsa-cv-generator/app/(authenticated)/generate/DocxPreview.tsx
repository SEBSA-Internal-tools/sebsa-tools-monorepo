'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, FileText, Download } from 'lucide-react';

interface DocxPreviewProps {
  /** The template ID to fetch and render. Pass null/empty to show placeholder. */
  templateId: string | null;
  /** Optional className for the outer wrapper */
  className?: string;
}

/**
 * DocxPreview renders a DOCX file using Microsoft Office Online Viewer.
 * It fetches a short-lived signed URL from Supabase Storage and embeds it
 * in an iframe.
 */
export default function DocxPreview({ templateId, className = '' }: DocxPreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setSignedUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchSignedUrl = async () => {
      setLoading(true);
      setIframeLoading(true);
      setError(null);
      setSignedUrl(null);

      try {
        const res = await fetch(`/api/templates/signed-url?templateId=${encodeURIComponent(templateId)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to generate signed URL (${res.status})`);
        }

        const data = await res.json();
        if (cancelled) return;

        if (!data.signedUrl) {
          throw new Error('Signed URL was not returned from the server.');
        }

        setSignedUrl(data.signedUrl);
      } catch (err: any) {
        if (!cancelled) {
          console.error('DocxPreview loading error:', err);
          setError(err.message || 'Failed to generate document preview URL');
          setIframeLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchSignedUrl();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (!templateId) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-400 gap-3 p-12 w-full h-[550px] ${className}`}>
        <FileText className="w-10 h-10 text-slate-300 animate-pulse" />
        <span className="text-xs font-semibold">Select a template to see preview</span>
      </div>
    );
  }

  // Office online viewer URL builder
  const viewerUrl = signedUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`
    : '';

  // Check if height class is defined in className to avoid conflict
  const hasHeightClass = className.split(' ').some(c => c.startsWith('h-') || c.startsWith('min-h-'));
  const heightStyle = hasHeightClass ? '' : 'h-[550px]';

  return (
    <div className={`relative w-full flex flex-col bg-white rounded-xl overflow-hidden border border-slate-200/80 shadow-sm ${heightStyle} ${className}`}>
      {/* Loading overlay for fetching signed URL or loading iframe */}
      {(loading || iframeLoading) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 backdrop-blur-xs z-10 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-650" />
          <span className="text-xs text-slate-400 font-bold tracking-wide">
            {loading ? 'Generating secure preview link...' : 'Loading document preview...'}
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3.5 p-8 text-center bg-slate-50/50">
          <AlertCircle className="w-9 h-9 text-rose-500" />
          <div className="space-y-1">
            <p className="text-xs font-black text-rose-700 uppercase tracking-wider">Preview failed</p>
            <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">{error}</p>
          </div>
          <a
            href={`/api/templates/raw?templateId=${encodeURIComponent(templateId)}`}
            download
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[10px] transition-colors cursor-pointer border border-indigo-100"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Original Template</span>
          </a>
        </div>
      )}

      {/* Office Online Viewer IFrame */}
      {signedUrl && !error && (
        <iframe
          src={viewerUrl}
          title="Word Document Preview"
          className="w-full h-full border-0"
          onLoad={() => setIframeLoading(false)}
        />
      )}

      {/* Fallback download bar displayed at the bottom when preview successfully loads */}
      {signedUrl && !error && !iframeLoading && (
        <div className="py-2.5 px-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-semibold shrink-0">
          <span>Microsoft Office Online Viewer</span>
          <a
            href={`/api/templates/raw?templateId=${encodeURIComponent(templateId)}`}
            download
            className="flex items-center gap-1.5 text-indigo-650 hover:text-indigo-850 hover:underline cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Download file</span>
          </a>
        </div>
      )}
    </div>
  );
}
