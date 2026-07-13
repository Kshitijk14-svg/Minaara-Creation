import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, copyFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { isAuthorized } from '@/lib/api-auth';
import { MEDIA_ROOT } from '@/lib/media';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Raw upload ceiling — generous because the server transcodes down to a
// bounded output size below; this just guards against absurd/abusive
// uploads, not the delivered file weight.
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;
const TRANSCODE_TIMEOUT_MS = 60_000;
const videosDir = path.join(MEDIA_ROOT, 'videos');

// Magic-byte check for MP4/MOV (ISO base media file format): an "ftyp" box
// always starts at byte offset 4, regardless of container brand.
function sniffVideo(bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) => sig.every((v, i) => bytes[offset + i] === v);
  return startsWith([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
}

function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { reject(err); return; }
      const duration = metadata.format?.duration;
      resolve(typeof duration === 'number' && Number.isFinite(duration) ? duration : null);
    });
  });
}

// Transcodes to H.264/AAC mp4, capped at 720px on the long edge with a
// bitrate ceiling — bounds the delivered file size regardless of how heavy
// the source upload was, and normalizes mp4/mov input to a single output
// format. faststart lets playback begin before the whole file downloads.
function transcode(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .outputOptions([
        '-vf', "scale='min(720,iw)':-2",
        '-crf', '26',
        '-preset', 'veryfast',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
      ])
      .audioCodec('aac')
      .audioBitrate('96k')
      .format('mp4')
      .on('end', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } })
      .on('error', (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } })
      .save(outputPath);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      command.kill('SIGKILL');
      reject(new Error('Transcode timed out'));
    }, TRANSCODE_TIMEOUT_MS);
  });
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
    return NextResponse.json({ error: `${file.name} exceeds ${MAX_BYTES / (1024 * 1024)} MB limit` }, { status: 400 });
  }

  const ext = file.type === 'video/quicktime' ? 'mov' : 'mp4';
  const tempInputPath = path.join(os.tmpdir(), `reel-in-${randomUUID()}.${ext}`);
  const tempOutputPath = path.join(os.tmpdir(), `reel-out-${randomUUID()}.mp4`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!sniffVideo(buffer.subarray(0, 12))) {
      return NextResponse.json({ error: `${file.name} is not a valid MP4/MOV file` }, { status: 400 });
    }

    await writeFile(tempInputPath, buffer);

    let duration: number | null;
    try {
      duration = await probeDuration(tempInputPath);
    } catch {
      return NextResponse.json({ error: `${file.name} could not be read as a video (corrupt file?)` }, { status: 400 });
    }
    if (duration !== null && duration > MAX_DURATION_SECONDS) {
      return NextResponse.json({ error: `Video is ${Math.round(duration)}s — keep it under ${MAX_DURATION_SECONDS}s` }, { status: 400 });
    }

    try {
      await transcode(tempInputPath, tempOutputPath);
    } catch (err) {
      console.error('[POST /api/upload/video] transcode failed', err);
      return NextResponse.json({ error: 'Video processing failed — try a shorter or lower-resolution clip' }, { status: 500 });
    }

    await mkdir(videosDir, { recursive: true });
    const filename = `${randomUUID()}.mp4`;
    // copy (not rename) — tempOutputPath is on the OS tmp filesystem, which
    // may be a different device/mount than MEDIA_ROOT, and rename() across
    // devices fails with EXDEV.
    await copyFile(tempOutputPath, path.join(videosDir, filename));

    return NextResponse.json({ url: `/media/videos/${filename}` });
  } catch (err) {
    console.error('[POST /api/upload/video]', err);
    const detail =
      process.env.NODE_ENV !== 'production' && err instanceof Error ? `: ${err.message}` : '';
    return NextResponse.json({ error: `Video upload failed${detail}` }, { status: 500 });
  } finally {
    await unlink(tempInputPath).catch(() => {});
    await unlink(tempOutputPath).catch(() => {});
  }
}
