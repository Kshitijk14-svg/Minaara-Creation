/**
 * Serves self-hosted reel videos with HTTP Range support, so seeking/scrubbing
 * works and browsers don't need to download the whole clip up front.
 *
 * In production this path should be intercepted by the reverse proxy (nginx/
 * Caddy) serving MEDIA_ROOT/videos/ directly as static files — see the
 * deployment plan for the location block. This route exists so the feature
 * also works out of the box in local dev (no reverse proxy) and as a
 * functional fallback until that ops change ships; it is deliberately NOT
 * merged into the image-only /media/[...path] route, which stays webp-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { MEDIA_ROOT } from '@/lib/media';

export const runtime = 'nodejs';

const FILENAME_RE = /^[a-zA-Z0-9_-]+\.(mp4|mov)$/;
const videosDir = path.join(MEDIA_ROOT, 'videos');

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = path.join(videosDir, filename);
  const resolved = path.resolve(filePath);
  if (path.relative(path.resolve(videosDir), resolved).startsWith('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let size: number;
  try {
    size = (await stat(resolved)).size;
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = filename.split('.').pop()!;
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const range = request.headers.get('range');

  if (!range) {
    const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : size - 1;
  if (start >= size || end >= size || start > end) {
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  const stream = Readable.toWeb(createReadStream(resolved, { start, end })) as ReadableStream;
  return new NextResponse(stream, {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}
