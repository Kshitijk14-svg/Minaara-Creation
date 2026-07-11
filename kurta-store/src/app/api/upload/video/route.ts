import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { isAuthorized } from '@/lib/api-auth';
import { MEDIA_ROOT } from '@/lib/media';

const MAX_BYTES = 40 * 1024 * 1024; // 40 MB per clip
const videosDir = path.join(MEDIA_ROOT, 'videos');

// Magic-byte check for MP4/MOV (ISO base media file format): an "ftyp" box
// always starts at byte offset 4, regardless of container brand.
function sniffVideo(bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) => sig.every((v, i) => bytes[offset + i] === v);
  return startsWith([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
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

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
    return NextResponse.json({ error: `${file.name} is not a supported video type (MP4/MOV only)` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `${file.name} exceeds 40 MB limit` }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!sniffVideo(buffer.subarray(0, 12))) {
      return NextResponse.json({ error: `${file.name} is not a valid MP4/MOV file` }, { status: 400 });
    }

    await mkdir(videosDir, { recursive: true });

    const ext = file.type === 'video/quicktime' ? 'mov' : 'mp4';
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(path.join(videosDir, filename), buffer);

    return NextResponse.json({ url: `/media/videos/${filename}` });
  } catch (err) {
    console.error('[POST /api/upload/video]', err);
    const detail =
      process.env.NODE_ENV !== 'production' && err instanceof Error ? `: ${err.message}` : '';
    return NextResponse.json({ error: `Video upload failed${detail}` }, { status: 500 });
  }
}
