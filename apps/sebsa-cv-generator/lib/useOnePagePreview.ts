'use client';

import { useEffect, useRef, useState } from 'react';

// CvPreviewTemplate renders at a natural 800px width (its own maxWidth). Treating that 800px as
// "210mm of real A4 width" is the same assumption lib/cvExport.ts's PDF export makes when it fits
// the screenshot to a 210mm page — so measuring a live render's natural (pre-transform) height
// and converting via that ratio tells us, accurately, whether content will actually fit on one
// exported page. Shared by the Customize CVs flow and the Download CV flow so "one page" means
// the same thing, measured the same way, in both places.
export const PREVIEW_SCALE = 0.28;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PREVIEW_NATURAL_WIDTH_PX = 800;
export const PREVIEW_FRAME_WIDTH_PX = Math.round(PREVIEW_NATURAL_WIDTH_PX * PREVIEW_SCALE);
export const PREVIEW_FRAME_HEIGHT_PX = Math.round(
  PREVIEW_NATURAL_WIDTH_PX * (A4_HEIGHT_MM / A4_WIDTH_MM) * PREVIEW_SCALE
);

/**
 * Measures a live CvPreviewTemplate render (attach `frameRef` to the pre-transform scaled
 * wrapper — see OnePagePreview.tsx) against a true A4 page, via ResizeObserver so it reacts to
 * anything that changes the rendered height (selection, edits, even font loading), not just a
 * one-shot calculation. `active` gates when the observer (re)attaches, since the target DOM node
 * only exists once there's something to preview — pass whether the CV being measured is non-null.
 */
export function useOnePagePreview(active: boolean) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [overflowMm, setOverflowMm] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) {
      setOverflowMm(0);
      return;
    }
    const measure = () => {
      if (!el.offsetWidth) return;
      const heightMm = (el.offsetHeight / el.offsetWidth) * A4_WIDTH_MM;
      setOverflowMm(Math.max(0, heightMm - A4_HEIGHT_MM));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return { frameRef, overflowMm };
}
