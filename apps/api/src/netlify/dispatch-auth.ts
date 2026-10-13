import { timingSafeEqual } from 'node:crypto';

/** Background function URLs are public; every invocation must carry this secret. */
export function isAuthorisedDispatch(authorization: unknown, secret: string): boolean {
  if (secret.length < 32 || typeof authorization !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
