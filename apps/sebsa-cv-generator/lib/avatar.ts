import type { SupabaseClient } from '@supabase/supabase-js';

// Deliberately empty, not a stock photo — profile pictures are now mandatory on every new
// profile (createEmployeeAction / onboarding actions), so a real photo should always exist. This
// only still gets hit for the handful of legacy pre-mandatory profiles with no photo on file;
// every render site already falls back to a plain UserCircle icon when this is falsy, and the CV
// template's `{{#if avatar}}` check treats '' as absent too — so leaving it empty means "no
// photo" renders as an icon/placeholder box instead of a fake stock photo baked into the UI/PDF.
export const DEFAULT_AVATAR = '';

/**
 * Resolves an avatar URL for display.
 *
 * - Public Supabase storage URLs (containing `/object/public/`) are returned directly,
 *   since the `profile-pictures` bucket is public and does not require signed URLs.
 * - Relative file paths (no http prefix) are used to generate a signed URL for
 *   private bucket objects.
 * - External URLs (e.g. Unsplash, data URIs) are returned as-is.
 * - Falls back to DEFAULT_AVATAR on any failure.
 */
export async function getSignedAvatarUrl(
  supabase: SupabaseClient,
  avatarUrl: string | null | undefined
): Promise<string> {
  if (!avatarUrl) return DEFAULT_AVATAR;

  // External images: return as-is
  if (avatarUrl.includes('unsplash.com') || avatarUrl.startsWith('data:')) {
    return avatarUrl;
  }

  // Public Supabase storage URL — bucket is public, no signed URL needed
  if (avatarUrl.includes('/object/public/')) {
    return avatarUrl;
  }

  // Full URL pointing to our bucket but NOT a public URL — extract path and sign it
  let filePath = '';
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    const marker = '/profile-pictures/';
    const index = avatarUrl.indexOf(marker);
    if (index !== -1) {
      filePath = avatarUrl.substring(index + marker.length);
    } else {
      // URL is not in our bucket — return as-is
      return avatarUrl;
    }
  } else {
    // Relative path inside the 'profile-pictures' bucket (private object)
    filePath = avatarUrl;
  }

  try {
    // Generate a signed URL valid for 1 hour (3600 seconds)
    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error('Failed to create signed URL for avatar:', error.message);
      return DEFAULT_AVATAR;
    }

    return data?.signedUrl ?? DEFAULT_AVATAR;
  } catch (err) {
    console.error('Error generating signed URL for avatar:', err);
    return DEFAULT_AVATAR;
  }
}
