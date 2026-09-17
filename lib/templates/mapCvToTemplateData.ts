import ImageModule from 'docxtemplater-image-module-free';
import type { TailoredCv } from '@/app/(authenticated)/generate/types';

/**
 * Maps TailoredCv (the single source of truth — app/(authenticated)/generate/types.ts) onto the
 * field names an uploaded master DOCX template's placeholders might use. Deliberately
 * alias-heavy: covers a few common naming conventions a template author might reasonably pick
 * (fullName vs. name, jobTitle vs. currentPosition vs. title, etc.) rather than forcing one
 * exact vocabulary.
 *
 * Was previously duplicated (with drift) across three routes — see docs/04-rbac-security.md
 * history. This is the one shared copy; both /api/templates/generate and
 * /api/templates/generate-preview must use it so a template that renders in one renders
 * identically in the other.
 *
 * Placeholder delimiters are `{{ }}` (matches app/(authenticated)/templates/page.tsx's on-screen
 * guidance to admins) — callers must pass `delimiters: { start: '{{', end: '}}' }` to
 * Docxtemplater, since the library defaults to single-brace `{ }`.
 */
export function mapCvToTemplateData(cv: TailoredCv, imageBuffer?: Buffer) {
  return {
    fullName: cv.name || '',
    name: cv.name || '',
    jobTitle: cv.currentPosition || '',
    currentPosition: cv.currentPosition || '',
    title: cv.currentPosition || '',
    objective: cv.summary || '',
    summary: cv.summary || '',
    experience: Array.isArray(cv.experience)
      ? cv.experience.map((e) => ({
          position: e.position || '',
          company: e.company || '',
          period: e.period || '',
          description: Array.isArray(e.tasks) ? e.tasks.map((t) => `• ${t}`).join('\n') : '',
          tasks: Array.isArray(e.tasks) ? e.tasks.map((t) => ({ task: t })) : [],
          tasksList: Array.isArray(e.tasks) ? e.tasks.map((t) => `• ${t}`).join('\n') : '',
        }))
      : [],
    education: Array.isArray(cv.academic)
      ? cv.academic.map((a) => ({
          degree: a.qualification || '',
          qualification: a.qualification || '',
          institution: a.institution || '',
          year: a.period || '',
          period: a.period || '',
        }))
      : [],
    academic: Array.isArray(cv.academic)
      ? cv.academic.map((a) => ({
          degree: a.qualification || '',
          qualification: a.qualification || '',
          institution: a.institution || '',
          year: a.period || '',
          period: a.period || '',
        }))
      : [],
    projects: Array.isArray(cv.specialProjects)
      ? cv.specialProjects.map((p) => ({
          projectName: p.title || '',
          title: p.title || '',
          projectDescription: p.brief || '',
          brief: p.brief || '',
        }))
      : [],
    specialProjects: Array.isArray(cv.specialProjects)
      ? cv.specialProjects.map((p) => ({
          projectName: p.title || '',
          title: p.title || '',
          projectDescription: p.brief || '',
          brief: p.brief || '',
        }))
      : [],
    certifications: Array.isArray(cv.certifications)
      ? cv.certifications.map((c) => ({
          certificateName: c.name || '',
          name: c.name || '',
          issuer: c.issuer || '',
          year: c.year || '',
        }))
      : [],
    ...(imageBuffer ? { profileImage: imageBuffer } : {}),
  };
}

/** Fetches an image URL and returns it as a Buffer, or null if unavailable/not an image. */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * Shared image module config for docxtemplater-image-module-free. `setParser` recognizes the
 * bare tag name `profileImage` (not the module's usual `%`-prefixed convention) — matches the
 * reference SEBSA template's plain `{{profileImage}}` placeholder.
 */
export function createImageModule(imageBuffer: Buffer) {
  const dimensions = getRasterImageDimensions(imageBuffer);
  const maxSizeEmu = 914400 * 1.2;
  let widthEmu = maxSizeEmu;
  let heightEmu = maxSizeEmu;

  if (dimensions) {
    const aspectRatio = dimensions.width / dimensions.height;
    if (aspectRatio > 1) {
      heightEmu = maxSizeEmu / aspectRatio;
    } else {
      widthEmu = maxSizeEmu * aspectRatio;
    }
  }

  return new ImageModule({
    centered: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setParser(placeHolderContent: string): any {
      if (placeHolderContent === 'profileImage') {
        return {
          type: 'placeholder',
          value: 'profileImage',
          module: 'open-xml-templating/docxtemplater-image-module',
          centered: false,
        };
      }
      return null;
    },
    getImage() {
      return imageBuffer;
    },
    getSize() {
      // EMUs (914400 EMU = 1 inch). Fit inside 1.2in without changing the source aspect ratio.
      return [widthEmu, heightEmu];
    },
  });
}

interface RasterImageDimensions {
  width: number;
  height: number;
}

/** Reads dimensions directly from the supported original JPEG/PNG bytes without re-encoding. */
export function getRasterImageDimensions(buffer: Buffer): RasterImageDimensions | null {
  // PNG IHDR stores width/height as unsigned big-endian integers at byte offsets 16 and 20.
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // Walk JPEG segments until a Start Of Frame marker containing the dimensions is found.
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;

      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame && segmentLength >= 7) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }

      offset += segmentLength;
    }
  }

  return null;
}
