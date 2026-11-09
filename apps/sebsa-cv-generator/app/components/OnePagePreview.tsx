'use client';

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import CvPreviewTemplate from '@/app/(authenticated)/generate/CvPreviewTemplate';
import type { TailoredCv } from '@/app/(authenticated)/generate/types';
import { useOnePagePreview, PREVIEW_SCALE, PREVIEW_FRAME_WIDTH_PX, PREVIEW_FRAME_HEIGHT_PX } from '@/lib/useOnePagePreview';

interface OnePagePreviewProps {
  cv: TailoredCv | null;
  /** Must be unique per mounted copy — passed straight to CvPreviewTemplate, which screenshots
   *  whichever DOM node has id="cv-preview-root" for export, so anything shown purely as a
   *  reference/thumbnail (like this one) needs its own id to avoid colliding with that target. */
  id: string;
  label?: string;
  /** Notified whenever the measured overflow changes (0 once it fits) — lets the parent gate a
   *  Download/Apply action on the one-page limit instead of only showing the inline warning below.
   *  Pass a stable callback (e.g. a useState setter) to avoid re-firing every parent render. */
  onOverflowChange?: (overflowMm: number) => void;
}

/**
 * Small, scaled, real-template CV preview with a live "fits on one page" / "exceeds one page"
 * indicator — shared by the Customize CVs selection step and the Download CV flow so both use the
 * exact same one-page rule (see lib/useOnePagePreview.ts) rather than two copies that could drift.
 */
export default function OnePagePreview({ cv, id, label = 'CV Preview (1 Page)', onOverflowChange }: OnePagePreviewProps) {
  const { frameRef, overflowMm } = useOnePagePreview(cv !== null);

  useEffect(() => {
    onOverflowChange?.(cv ? overflowMm : 0);
  }, [cv, overflowMm, onOverflowChange]);

  if (!cv) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <div
        className="mx-auto border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm"
        style={{ width: PREVIEW_FRAME_WIDTH_PX, height: PREVIEW_FRAME_HEIGHT_PX }}
      >
        <div
          ref={frameRef}
          style={{
            transform: `scale(${PREVIEW_SCALE})`,
            transformOrigin: 'top left',
            width: `${100 / PREVIEW_SCALE}%`,
          }}
        >
          <CvPreviewTemplate cv={cv} id={id} />
        </div>
      </div>
      {overflowMm > 0 ? (
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5 leading-snug">
          <AlertCircle className="w-3 h-3 shrink-0" />
          Exceeds one page — some content may be cut off when exported.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          Fits on one page
        </p>
      )}
    </div>
  );
}
