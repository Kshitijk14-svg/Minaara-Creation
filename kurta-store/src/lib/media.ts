import path from 'path';

/**
 * Root directory for self-hosted media storage. In production this must be
 * set to a path OUTSIDE the git checkout (e.g. /var/www/minaara/shared/uploads)
 * so redeploys never wipe uploaded files. Defaults to a project-local,
 * gitignored ./uploads for local dev.
 */
export const MEDIA_ROOT = process.env.MEDIA_DIR || path.join(process.cwd(), 'uploads');

/**
 * Rewrite a locally-served media URL (/media/<uuid>.webp) to request a
 * resized variant via the on-demand resize route. Safe to call on any
 * string: non-/media/ URLs (e.g. local /public fallback assets) are
 * returned unchanged.
 *
 * Use this for raw <img> tags that can't go through next/image, so browsers
 * download an appropriately sized image rather than the stored original.
 */
export function localResize(url: string, width: number): string {
  if (!url || !url.startsWith('/media/')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}w=${width}`;
}
