'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FormField, { inputStyle } from '../components/shared/FormField';
import ImageUploader from '../components/shared/ImageUploader';
import LoadingSkeleton from '../components/shared/LoadingSkeleton';

interface CollectionForm {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyForm: CollectionForm = {
  name: '', slug: '', description: '', imageUrl: '', sortOrder: '0', isActive: true,
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type CollectionFormClientProps =
  | { mode: 'create' }
  | { mode: 'edit'; collectionId: string };

export default function CollectionFormClient(props: CollectionFormClientProps) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';

  const [form, setForm]             = useState<CollectionForm>(emptyForm);
  const [slugLocked, setSlugLocked] = useState(isEdit);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(isEdit);
  const [notFound, setNotFound]     = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    const collectionId = (props as { mode: 'edit'; collectionId: string }).collectionId;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/collections?includeInactive=true');
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        const col = (data || []).find((c: { id: string }) => c.id === collectionId);
        if (!col) { if (!cancelled) setNotFound(true); return; }
        if (cancelled) return;
        setForm({
          name: col.name,
          slug: col.slug,
          description: col.description || '',
          imageUrl: col.imageUrl || '',
          sortOrder: String(col.sortOrder),
          isActive: col.isActive,
        });
      } catch {
        if (!cancelled) setFormError('Failed to load collection');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  function onNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugLocked ? f.slug : toSlug(name) }));
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.slug.trim()) { setFormError('Slug is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...(isEdit ? { id: (props as { mode: 'edit'; collectionId: string }).collectionId } : {}),
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        sortOrder: parseInt(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      const res = await fetch('/api/collections', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) { setFormError('A collection with that name or slug already exists'); return; }
        setFormError(err.error || 'Something went wrong');
        return;
      }
      router.push('/admin?tab=collections');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', padding: '40px 24px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link href="/admin?tab=collections" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none',
          fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '20px',
        }}>
          <span style={{ display: 'inline-block', width: '16px', height: '1px', backgroundColor: 'currentColor', opacity: 0.5 }} />
          Back to Collections
        </Link>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 24px' }}>
          {isEdit ? 'Edit Collection' : 'New Collection'}
        </h1>

        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-card-border)',
          borderRadius: '12px',
          boxShadow: 'var(--admin-card-shadow)',
          padding: '28px',
        }}>
          {notFound ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.6, textAlign: 'center', padding: '40px 0' }}>
              Collection not found
            </p>
          ) : loading ? (
            <LoadingSkeleton rows={5} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FormField label="Name" required>
                <input style={inputStyle} value={form.name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Summer Kurtas" />
              </FormField>

              <FormField label="Slug" required hint="Auto-generated from name. Used in URLs.">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="summer-kurtas" />
                  <button type="button" onClick={() => setSlugLocked((l) => !l)} style={slugToggleStyle}>
                    {slugLocked ? 'Unlock' : 'Lock'}
                  </button>
                </div>
              </FormField>

              <FormField label="Description">
                <textarea
                  style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' } as React.CSSProperties}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this collection"
                />
              </FormField>

              <FormField label="Image" hint="Upload a cover image for this collection.">
                <ImageUploader
                  images={form.imageUrl ? [form.imageUrl] : []}
                  onChange={(urls) => setForm((f) => ({ ...f, imageUrl: urls[0] ?? '' }))}
                  maxImages={1}
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Sort Order">
                  <input style={inputStyle} type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} min="0" />
                </FormField>
                <FormField label="Active">
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={toggleLabelStyle}>{form.isActive ? 'Visible in store' : 'Hidden'}</span>
                  </div>
                </FormField>
              </div>

              {formError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#dc2626', margin: 0 }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <Link href="/admin?tab=collections" style={cancelBtnStyle}>Cancel</Link>
                <button onClick={handleSave} disabled={saving} style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="btn-liquid">
                  {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '6px',
  border: '1px solid var(--color-brand-mist)',
  background: 'none', fontFamily: 'var(--font-body)', fontSize: '10px',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
  color: 'var(--color-brand-charcoal)', opacity: 0.6, cursor: 'pointer',
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: 'none',
  background: 'var(--color-brand-charcoal)', color: '#fff',
  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.12em',
};

const slugToggleStyle: React.CSSProperties = {
  flexShrink: 0, padding: '8px 12px', borderRadius: '6px',
  border: '1px solid var(--color-brand-mist)',
  background: 'none', fontFamily: 'var(--font-body)', fontSize: '10px',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--color-brand-charcoal)', cursor: 'pointer', opacity: 0.7,
};

const toggleLabelStyle: React.CSSProperties = {
  marginLeft: '12px', fontFamily: 'var(--font-body)', fontSize: '12px',
  color: 'var(--color-brand-charcoal)', opacity: 0.6,
};
