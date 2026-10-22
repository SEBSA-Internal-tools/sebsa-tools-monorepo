export const PROFILE_PICTURE_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

// Server Actions default to a 1 MB request-body limit. Keep enough room for multipart and action
// metadata so a valid image never reaches Next.js's generic "Body exceeded 1 MB" production error.
export const MAX_PROFILE_PICTURE_BYTES = 900 * 1024;

export function getProfilePictureValidationError(
  file: Pick<File, 'type' | 'size'>
): string | null {
  if (!PROFILE_PICTURE_ACCEPTED_TYPES.includes(file.type as (typeof PROFILE_PICTURE_ACCEPTED_TYPES)[number])) {
    return 'Please upload a JPG, PNG, WEBP, or GIF image.';
  }
  if (file.size > MAX_PROFILE_PICTURE_BYTES) {
    return 'Profile picture must be smaller than 1 MB.';
  }
  return null;
}

