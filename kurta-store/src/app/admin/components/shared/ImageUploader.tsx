'use client';

import React, { useRef, useState } from 'react';

interface ImageUploaderProps {
  images: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
}

export default function ImageUploader({ images, onChange, maxImages = 8 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  async function handleFiles(files: FileList) {
    setUploadError(null);
    const remaining = maxImages - images.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const fd = new FormData();
      toUpload.forEach((f) => fd.append('files', f));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        setUploadError(err.error || 'Upload failed');
        return;
      }
      const { urls } = await res.json();
      onChange([...images, ...urls]);
    } catch {
      setUploadError('Network error during upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function onDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function onDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    setDragOver(null);
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    const reordered = [...images];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    dragIndexRef.current = null;
    onChange(reordered);
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    setDragOver(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {images.map((url, i) => (
          <div
            key={url + i}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={onDragEnd}
            style={{
              position: 'relative', width: '96px', height: '96px',
              borderRadius: '8px', overflow: 'hidden',
              border: dragOver === i ? '2px dashed var(--color-brand-gold)' : '1px solid var(--color-brand-mist)',
              cursor: 'grab', flexShrink: 0,
              boxShadow: dragOver === i ? '0 0 0 2px rgba(166,128,38,0.15)' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <img
              src={url}
              alt={`Image ${i + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
            />
            {/* Drag handle indicator */}
            <div style={{
              position: 'absolute', top: '4px', left: '4px',
              background: 'rgba(0,0,0,0.45)', borderRadius: '3px',
              padding: '2px 3px', lineHeight: 1, pointerEvents: 'none',
            }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
                <circle cx="3" cy="3" r="1"/><circle cx="7" cy="3" r="1"/>
                <circle cx="3" cy="7" r="1"/><circle cx="7" cy="7" r="1"/>
              </svg>
            </div>
            {/* Remove button */}
            <button
              type="button"
              onClick={() => removeImage(i)}
              style={{
                position: 'absolute', top: '4px', right: '4px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'rgba(220,38,38,0.85)', border: 'none',
                color: '#fff', fontSize: '11px', lineHeight: 1,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
              aria-label={`Remove image ${i + 1}`}
            >
              ×
            </button>
            {/* Position badge */}
            <div style={{
              position: 'absolute', bottom: '4px', left: '4px',
              background: 'rgba(0,0,0,0.5)', borderRadius: '3px',
              padding: '1px 5px',
              fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700,
              color: '#fff', letterSpacing: '0.05em',
              pointerEvents: 'none',
            }}>
              {i + 1}
            </div>
          </div>
        ))}

        {/* Add slot */}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '96px', height: '96px', borderRadius: '8px',
              border: '1.5px dashed var(--color-brand-mist)',
              background: uploading ? 'rgba(0,0,0,0.03)' : 'transparent',
              cursor: uploading ? 'wait' : 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '4px',
              color: 'var(--color-brand-charcoal)', opacity: 0.45,
              transition: 'opacity 0.15s, border-color 0.15s',
              flexShrink: 0,
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
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Add
                </span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
      />

      {uploadError && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#dc2626', margin: '8px 0 0' }}>
          {uploadError}
        </p>
      )}

      {images.length > 0 && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '8px 0 0' }}>
          {images.length}/{maxImages} images · Drag to reorder · First image is the cover
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
