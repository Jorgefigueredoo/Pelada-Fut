const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Every avatar lives at this one path, so re-uploading always replaces the same
 * object instead of leaving old ones behind in storage. */
export function avatarStoragePath(userId: string): string {
  return `${userId}/avatar.webp`;
}

/**
 * Public CDN URL for an avatar, or null when the player has none. The `v` query
 * param busts the CDN cache when the fixed path gets a new upload.
 */
export function avatarUrl(path: string | null, updatedAt: string | null): string | null {
  if (!path) return null;
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${version}`;
}
