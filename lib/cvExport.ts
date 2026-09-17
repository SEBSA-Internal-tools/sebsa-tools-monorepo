/**
 * lib/cvExport.ts
 *
 * Client-side only export utilities. Both functions are async and dynamically import
 * their heavy dependencies so they don't bloat the initial page bundle.
 *
 * Usage:
 *   await exportToPdf('cv-preview-root', 'JohnDoe_CV')
 *   await exportTemplatedDocx(templateId, tailoredCv, avatarUrl, 'JohnDoe_CV')
 */

import type { TailoredCv } from '@/app/(authenticated)/generate/types';

const CSS_DPI = 96;
const PDF_RASTER_DPI = 300;

interface OriginalProfileImage {
  bytes: Uint8Array;
  format: 'JPEG' | 'PNG';
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius: number;
  };
}

function detectSupportedImageFormat(bytes: Uint8Array, contentType: string): 'JPEG' | 'PNG' | null {
  if (
    contentType.toLowerCase().includes('image/png') ||
    (bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47)
  ) {
    return 'PNG';
  }

  if (
    contentType.toLowerCase().includes('image/jpeg') ||
    (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  ) {
    return 'JPEG';
  }

  return null;
}

/**
 * Loads the original uploaded profile image and records its position inside the CV. The full
 * image bytes are embedded over html2canvas's rasterized copy later, so the photo is not limited
 * to the resolution of the page screenshot or subjected to a second JPEG encode.
 */
async function loadOriginalProfileImage(
  element: HTMLElement,
  pdfWidth: number
): Promise<OriginalProfileImage | null> {
  const profileImage = element.querySelector<HTMLElement>('[data-cv-profile-image-url]');
  const url = profileImage?.dataset.cvProfileImageUrl;
  if (!profileImage || !url) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    const format = detectSupportedImageFormat(bytes, response.headers.get('content-type') ?? '');
    if (!format) return null;

    const elementRect = element.getBoundingClientRect();
    const imageRect = profileImage.getBoundingClientRect();
    if (elementRect.width <= 0 || imageRect.width <= 0 || imageRect.height <= 0) return null;

    const pxToPdf = pdfWidth / elementRect.width;
    const computedStyle = window.getComputedStyle(profileImage);
    const borderRadiusPx = Number.parseFloat(computedStyle.borderTopLeftRadius) || 0;

    return {
      bytes,
      format,
      frame: {
        x: (imageRect.left - elementRect.left) * pxToPdf,
        y: (imageRect.top - elementRect.top) * pxToPdf,
        width: imageRect.width * pxToPdf,
        height: imageRect.height * pxToPdf,
        borderRadius: borderRadiusPx * pxToPdf,
      },
    };
  } catch {
    // A high-resolution, lossless page capture remains as the fallback for images whose origin
    // does not permit fetching their original bytes from the browser.
    return null;
  }
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
// Screenshots #cv-preview-root (the live Handlebars preview, lib/templates/cvTemplate.ts) via
// html2canvas and tiles it across A4 pages. Requires that element and everything inside it to
// use inline styles only — see CvPreviewTemplate.tsx's comment on why (oklch()).

export async function exportToPdf(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error(`Element #${elementId} not found in DOM.`);

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // The root element carries a decorative border/rounded-corner/box-shadow for the on-screen
  // preview card (CvPreviewTemplate.tsx) — html2canvas screenshots it verbatim, so that border's
  // bottom edge (plus the shadow underneath it) got baked into the exported image and showed up
  // as a stray horizontal line wherever the content happened to end, including alone on an
  // otherwise-blank trailing page. None of that chrome belongs in the exported document, so it's
  // stripped from the live element for the duration of the capture and restored immediately after.
  const previousBorder = element.style.border;
  const previousBoxShadow = element.style.boxShadow;
  const previousBorderRadius = element.style.borderRadius;
  element.style.border = 'none';
  element.style.boxShadow = 'none';
  element.style.borderRadius = '0';

  // A4 dimensions in mm
  const pdfW = 210;
  const pdfH = 297;

  let canvas: HTMLCanvasElement;
  let originalProfileImage: OriginalProfileImage | null = null;
  try {
    // Read the frame after removing the preview chrome so its coordinates match the canvas.
    // Fetching is started before html2canvas so it runs alongside the relatively expensive
    // high-resolution page capture.
    const originalProfileImagePromise = loadOriginalProfileImage(element, pdfW);
    canvas = await html2canvas(element, {
      // 300 DPI produces print-quality fallback output if an external image cannot be fetched.
      // The original profile-image bytes are still embedded separately below whenever possible.
      scale: PDF_RASTER_DPI / CSS_DPI,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    originalProfileImage = await originalProfileImagePromise;
  } finally {
    element.style.border = previousBorder;
    element.style.boxShadow = previousBoxShadow;
    element.style.borderRadius = previousBorderRadius;
  }

  // PNG keeps the captured document lossless. In particular, it avoids applying another lossy
  // JPEG pass to the profile photo when its original bytes cannot be fetched because of CORS.
  const imgData = canvas.toDataURL('image/png');

  const imgAspect = canvas.height / canvas.width;
  const imgH = pdfW * imgAspect;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  let yOffset = 0;
  let remaining = imgH;

  // Multi-page support: slice the canvas image across A4 pages. A small leftover sliver past a
  // full page (the template's own bottom padding/margins rounding up just past 297mm) doesn't get
  // its own near-blank trailing page — the template always has enough bottom whitespace (32px
  // outer padding + 22px section spacing) that anything this small is never real content.
  const MIN_TRAILING_CONTENT_MM = 40;

  while (remaining > 0) {
    pdf.addImage(imgData, 'PNG', 0, yOffset > 0 ? -yOffset : 0, pdfW, imgH, undefined, 'FAST');

    remaining -= pdfH;
    if (remaining > MIN_TRAILING_CONTENT_MM) {
      pdf.addPage();
      yOffset += pdfH;
    } else {
      break;
    }
  }

  if (originalProfileImage) {
    try {
      const { bytes, format, frame } = originalProfileImage;
      const imageProperties = pdf.getImageProperties(bytes);
      const imageAspect = imageProperties.width / imageProperties.height;
      const frameAspect = frame.width / frame.height;

      // Match CSS background-size: cover/background-position: center without stretching. The PDF
      // clip path crops only the excess, while jsPDF embeds the original JPEG/PNG bytes rather than
      // a thumbnail made from the html2canvas output.
      let imageX = frame.x;
      let imageY = frame.y;
      let imageWidth = frame.width;
      let imageHeight = frame.height;
      if (imageAspect > frameAspect) {
        imageWidth = frame.height * imageAspect;
        imageX -= (imageWidth - frame.width) / 2;
      } else {
        imageHeight = frame.width / imageAspect;
        imageY -= (imageHeight - frame.height) / 2;
      }

      const pageNumber = Math.floor(frame.y / pdfH) + 1;
      if (pageNumber <= pdf.getNumberOfPages()) {
        const pageOffset = (pageNumber - 1) * pdfH;
        pdf.setPage(pageNumber);
        pdf.saveGraphicsState();
        try {
          pdf
            .roundedRect(
              frame.x,
              frame.y - pageOffset,
              frame.width,
              frame.height,
              frame.borderRadius,
              frame.borderRadius,
              null
            )
            .clip()
            .discardPath();
          pdf.addImage(
            bytes,
            format,
            imageX,
            imageY - pageOffset,
            imageWidth,
            imageHeight,
            undefined,
            'NONE'
          );
        } finally {
          pdf.restoreGraphicsState();
        }
      }
    } catch (error) {
      // Keep export available for a corrupt or unusually encoded file; the lossless 300-DPI
      // capture already contains the browser-rendered photo as a safe fallback.
      console.warn('Could not embed original profile image in PDF; using captured image.', error);
    }
  }

  pdf.save(`${filename}.pdf`);
}

// ─── DOCX Export ──────────────────────────────────────────────────────────────
// Fills the actual uploaded master DOCX template (docxtemplater, server-side) rather than
// converting scraped HTML — this is what preserves real Word formatting. See
// app/api/templates/generate/route.ts.

export async function exportTemplatedDocx(
  templateId: string,
  tailoredCv: TailoredCv,
  avatarUrl: string | null | undefined,
  filename: string
): Promise<void> {
  const response = await fetch('/api/templates/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, tailoredCv, avatarUrl: avatarUrl ?? undefined }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Failed to generate DOCX file from the template.');
  }

  const blob = await response.blob();
  const { saveAs } = await import('file-saver');
  saveAs(blob, `${filename}.docx`);
}
