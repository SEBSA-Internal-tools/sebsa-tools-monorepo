/**
 * Centralized Handover ID generator for mock and test environments.
 * Format: HND-YYYYMMDD-XXXX (e.g. HND-20260922-A7K4)
 *
 * Rules:
 * 1. Uses UTC consistently for the YYYYMMDD date portion.
 * 2. Generates 4 uppercase alphanumeric characters for the suffix.
 * 3. Enforces uniqueness against provided existing IDs.
 * 4. Supports an injectable random source for deterministic testing.
 */

const SUFFIX_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface GenerateHandoverIdOptions {
  existingIds?: Iterable<string>;
  date?: Date;
  randomSource?: () => number;
}

export function generateHandoverId(options: GenerateHandoverIdOptions = {}): string {
  const { existingIds, date = new Date(), randomSource = Math.random } = options;

  const existing = existingIds ? new Set(existingIds) : null;

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;

  for (let attempt = 0; attempt < 1000; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      const idx = Math.floor(randomSource() * SUFFIX_CHARS.length);
      suffix += SUFFIX_CHARS[idx % SUFFIX_CHARS.length];
    }
    const candidate = `HND-${datePart}-${suffix}`;
    if (!existing?.has(candidate)) {
      return candidate;
    }
  }

  // Safe fallback if collision space is exhausted
  const fallbackSuffix = String(Math.floor(randomSource() * 10000)).padStart(4, '0');
  return `HND-${datePart}-${fallbackSuffix}`;
}
