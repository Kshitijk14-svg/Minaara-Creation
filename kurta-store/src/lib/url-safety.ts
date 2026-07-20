/**
 * Guards against javascript:/data: URI injection when rendering an
 * externally-sourced URL (e.g. Delhivery tracking links) as an href.
 * Isomorphic — safe to import from both server and client components.
 */
export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
