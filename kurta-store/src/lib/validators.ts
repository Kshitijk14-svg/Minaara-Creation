import { z } from 'zod';

/**
 * Image/link URL accepted by admin write APIs: an absolute http(s) URL or a
 * site-relative path. Uploads via /api/upload produce relative /media/<uuid>.webp
 * paths, which z.string().url() would reject.
 */
export const imageUrlSchema = z.string().min(1).refine(
  (v) => v.startsWith('/') || /^https?:\/\//i.test(v),
  'Must be a URL or site-relative path',
);
