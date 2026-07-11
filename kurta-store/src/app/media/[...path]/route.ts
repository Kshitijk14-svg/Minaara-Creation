/**
 * Serves self-hosted media files, with on-demand resizing + disk caching.
 *
 *   GET /media/<uuid>.webp          -> original file
 *   GET /media/<uuid>.webp?w=300    -> resized (cached after first request)
 *
 * Uploaded files always have a <uuid>.webp filename (see /api/upload), so a
 * strict allowlist regex plus a path-containment check fully closes off
 * path traversal — there's never a legitimate reason for the path segment
 * to contain anything else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFile, mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';
import { MEDIA_ROOT } from '@/lib/media';
import { loadSharp } from '@/lib/sharp-loader';

export const runtime = 'nodejs';

const FILENAME_RE = /^[a-zA-Z0-9_-]+\.webp$/;
const MIN_WIDTH = 16;
const MAX_WIDTH = 2000;
const WIDTH_BUCKET = 10;

const originalsDir = path.join(MEDIA_ROOT, 'originals');
const cacheDir = path.join(MEDIA_ROOT, 'cache');

// De-dupe concurrent first-requests for the same resized asset.
const inFlight = new Map<string, Promise<Buffer>>();

function resolveWithinDir(dir: string, filename: string): string | null {
  const resolved = path.resolve(dir, filename);
  const relative = path.relative(path.resolve(dir), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

async function readIfExists(filePath: string): Promise<Buffer | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  if (!segments || segments.length !== 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filename = segments[0];
  if (!FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const originalPath = resolveWithinDir(originalsDir, filename);
  if (!originalPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const widthParam = request.nextUrl.searchParams.get('w');

  // No width requested: stream the original as-is.
  if (!widthParam) {
    const buffer = await readIfExists(originalPath);
    if (!buffer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const parsedWidth = parseInt(widthParam, 10);
  if (!Number.isFinite(parsedWidth)) {
    return NextResponse.json({ error: 'Invalid width' }, { status: 400 });
  }
  const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsedWidth));
  const width = Math.round(clamped / WIDTH_BUCKET) * WIDTH_BUCKET;

  const widthCacheDir = path.join(cacheDir, String(width));
  const cachedPath = resolveWithinDir(widthCacheDir, filename);
  if (!cachedPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let buffer = await readIfExists(cachedPath);

  if (!buffer) {
    const cacheKey = cachedPath;
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const original = await readIfExists(originalPath);
        if (!original) throw new Error('Original not found');
        const sharp = loadSharp();
        const resized = await sharp(original)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        await mkdir(widthCacheDir, { recursive: true });
        await writeFile(cachedPath, resized);
        return resized;
      })();
      inFlight.set(cacheKey, pending);
      pending.finally(() => inFlight.delete(cacheKey));
    }

    try {
      buffer = await pending;
    } catch (err) {
      console.error('[GET /media] resize failed:', err);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
