import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { isAuthorized } from '@/lib/api-auth';
import { MEDIA_ROOT } from '@/lib/media';
import { loadSharp } from '@/lib/sharp-loader';

const MAX_FILES = 8;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const originalsDir = path.join(MEDIA_ROOT, 'originals');

// Magic-byte signatures for the image formats we accept (don't trust file.type).
// BMP intentionally excluded — sharp/libvips doesn't reliably decode it.
function sniffImage(bytes: Uint8Array): boolean {
  const b = bytes;
  const startsWith = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
  return (
    startsWith([0xff, 0xd8, 0xff]) ||                                  // JPEG
    startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||   // PNG
    startsWith([0x47, 0x49, 0x46, 0x38]) ||                           // GIF
    (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) // WEBP (RIFF....WEBP)
  );
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} images allowed` }, { status: 400 });
  }

  const urls: string[] = [];

  try {
    const sharp = loadSharp();
    await mkdir(originalsDir, { recursive: true });

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: `${file.name} is not an image` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name} exceeds 10 MB limit` }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify actual file contents, not just the client-supplied MIME type.
      if (!sniffImage(buffer.subarray(0, 16))) {
        return NextResponse.json({ error: `${file.name} is not a valid image` }, { status: 400 });
      }

      const processed = await sharp(buffer)
        .rotate() // bake in EXIF orientation, then strip metadata
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const filename = `${randomUUID()}.webp`;
      await writeFile(path.join(originalsDir, filename), processed);
      urls.push(`/media/${filename}`);
    }
  } catch (err) {
    console.error('[POST /api/upload]', err);
    // Expose the underlying reason outside production so the admin UI shows
    // it instead of the opaque generic message.
    const detail =
      process.env.NODE_ENV !== 'production' && err instanceof Error ? `: ${err.message}` : '';
    return NextResponse.json({ error: `Image upload failed${detail}` }, { status: 500 });
  }

  return NextResponse.json({ urls });
}
