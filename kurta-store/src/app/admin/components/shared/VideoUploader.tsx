'use client';

import React, { useRef, useState } from 'react';
import { localResize } from '@/lib/media';

interface VideoUploaderProps {
  videoUrl: string | null;
  posterUrl: string | null;
  onChange: (value: { videoUrl: string | null; posterUrl: string | null }) => void;
}

// The server transcodes every accepted upload down to a bounded, compressed
// output (see /api/upload/video), so this ceiling just guards against
// absurd uploads — it doesn't dictate the delivered file size.
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;

// Grabs a frame from the picked video file and encodes it as a webp blob,
// entirely in the browser — avoids needing a server-side transcode step
// (e.g. ffmpeg) just to produce a poster thumbnail.
function capturePosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);

    const cleanup = () => URL.revokeObjectURL(video.src);

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(0.1, video.duration || 0.1);
    });
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, 'image/webp', 0.85);
      } catch {
        cleanup();
        resolve(null);
      }
    });
    video.addEventListener('error', () => { cleanup(); resolve(null); });
  });
}

function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(Number.isFinite(duration) ? duration : null);
    });
    video.addEventListener('error', () => { URL.revokeObjectURL(video.src); resolve(null); });
  });
}

export default function VideoUploader({ videoUrl, posterUrl, onChange }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadError(null);

    if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
      setUploadError('Only MP4 or MOV files are supported');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(`Video exceeds ${MAX_BYTES / (1024 * 1024)} MB limit`);
      return;
    }

    setUploading(true);
    try {
      const duration = await getVideoDuration(file);
      if (duration && duration > MAX_DURATION_SECONDS) {
        setUploadError(`Video is ${Math.round(duration)}s — keep it under ${MAX_DURATION_SECONDS}s for a snappy preview`);
      }

      let newPosterUrl: string | null = posterUrl;
      const posterBlob = await capturePosterFrame(file);
      if (posterBlob) {
        const posterFile = new File([posterBlob], 'poster.webp', { type: 'image/webp' });
        const fd = new FormData();
        fd.append('files', posterFile);
        const posterRes = await fetch('/api/upload', { method: 'POST', body: fd });
        if (posterRes.ok) {
          const { urls } = await posterRes.json();
          newPosterUrl = urls[0] ?? null;
        }
        // Poster capture/upload failing is non-fatal — the video itself is what matters.
      }

      const videoFd = new FormData();
      videoFd.append('file', file);
      const videoRes = await fetch('/api/upload/video', { method: 'POST', body: videoFd });
      if (!videoRes.ok) {
        try {
          const err = await videoRes.json();
          setUploadError(err.error || 'Video upload failed');
        } catch {
          setUploadError('Video upload failed (server error)');
        }
        return;
      }
      const { url } = await videoRes.json();
      onChange({ videoUrl: url, posterUrl: newPosterUrl });
    } catch {
      setUploadError('Network error during upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeVideo() {
    onChange({ videoUrl: null, posterUrl: null });
  }

  return (
    <div>
      {!videoUrl ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            width: '96px', height: '168px', borderRadius: '8px',
            border: '1.5px dashed var(--color-brand-mist)',
            background: uploading ? 'rgba(0,0,0,0.03)' : 'transparent',
            cursor: uploading ? 'wait' : 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '4px',
            color: 'var(--color-brand-charcoal)', opacity: 0.45,
            transition: 'opacity 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => { if (!uploading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.75'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.45'; }}
        >
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                Add Reel<br/>Video
              </span>
            </>
          )}
        </button>
      ) : (
        <div style={{ position: 'relative', width: '96px', height: '168px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-brand-mist)' }}>
          <video
            src={videoUrl}
            poster={posterUrl ? localResize(posterUrl, 400) : undefined}
            controls
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={removeVideo}
            style={{
              position: 'absolute', top: '4px', right: '4px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: 'rgba(220,38,38,0.85)', border: 'none',
              color: '#fff', fontSize: '11px', lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
            aria-label="Remove reel video"
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              position: 'absolute', bottom: '4px', left: '4px', right: '4px',
              background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '3px',
              color: '#fff', fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '3px 0', cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Uploading & compressing…' : 'Replace'}
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />

      {uploadError && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#dc2626', margin: '8px 0 0' }}>
          {uploadError}
        </p>
      )}

      <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '8px 0 0' }}>
        MP4/MOV · Max 150MB · Auto-compressed on upload · Shown as a floating preview on the product page
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
