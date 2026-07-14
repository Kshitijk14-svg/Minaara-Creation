'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Collection, SizeLabel } from '@/types/schema';
import FormField, { inputStyle, selectStyle } from '../components/shared/FormField';
import ImageUploader from '../components/shared/ImageUploader';
import VideoUploader from '../components/shared/VideoUploader';
import LoadingSkeleton from '../components/shared/LoadingSkeleton';

const SIZE_LABELS: SizeLabel[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface ProductForm {
  title: string;
  slug: string;
  description: string;
  priceINR: string;
  compareAtPriceINR: string;
  weightGrams: string;
  collectionId: string;
  isActive: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  newArrivalUntil: string; // datetime-local value, '' = none
  sizes: Record<SizeLabel, string>;
  images: string[];
  reelVideoUrl: string | null;
  reelVideoPosterUrl: string | null;
}

const emptyForm: ProductForm = {
  title: '', slug: '', description: '',
  priceINR: '', compareAtPriceINR: '', weightGrams: '',
  collectionId: '', isActive: true, isFeatured: false,
  isBestseller: false, isNewArrival: false, newArrivalUntil: '',
  sizes: { XS: '0', S: '0', M: '0', L: '0', XL: '0', XXL: '0' },
  images: [],
  reelVideoUrl: null,
  reelVideoPosterUrl: null,
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

type ProductFormClientProps =
  | { mode: 'create' }
  | { mode: 'edit'; productId: string };

export default function ProductFormClient(props: ProductFormClientProps) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';

  const [form, setForm]             = useState<ProductForm>(emptyForm);
  const [slugLocked, setSlugLocked] = useState(isEdit);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(isEdit);
  const [notFound, setNotFound]     = useState(false);

  useEffect(() => {
    fetch('/api/collections?includeInactive=true')
      .then((r) => r.json())
      .then((d) => setCollections(d.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    const productId = (props as { mode: 'edit'; productId: string }).productId;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (res.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!res.ok) throw new Error();
        const { product: p } = await res.json();
        if (cancelled) return;
        const sizes: Record<SizeLabel, string> = { XS: '0', S: '0', M: '0', L: '0', XL: '0', XXL: '0' };
        SIZE_LABELS.forEach((s) => { sizes[s] = String(p.sizes?.[s] ?? 0); });
        setForm({
          title: p.title,
          slug: p.slug,
          description: p.description,
          priceINR: String(p.priceINR),
          compareAtPriceINR: p.compareAtPriceINR ? String(p.compareAtPriceINR) : '',
          weightGrams: p.weightGrams ? String(p.weightGrams) : '',
          collectionId: p.collectionId || '',
          isActive: p.isActive,
          isFeatured: p.isFeatured,
          isBestseller: !!p.isBestseller,
          isNewArrival: !!p.isNewArrival,
          newArrivalUntil: p.newArrivalUntil ? isoToLocalInput(p.newArrivalUntil) : '',
          sizes,
          images: p.images || [],
          reelVideoUrl: p.reelVideoUrl ?? null,
          reelVideoPosterUrl: p.reelVideoPosterUrl ?? null,
        });
      } catch {
        if (!cancelled) setFormError('Failed to load product');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  const onTitleChange = useCallback((title: string) => {
    setForm((f) => ({ ...f, title, slug: slugLocked ? f.slug : toSlug(title) }));
  }, [slugLocked]);

  async function handleSave() {
    setFormError(null);
    if (!form.title.trim()) { setFormError('Title is required'); return; }
    if (!form.priceINR || isNaN(Number(form.priceINR))) { setFormError('Price is required'); return; }
    if (!form.collectionId) { setFormError('Collection is required'); return; }
    setSaving(true);
    try {
      const variants = SIZE_LABELS.map((s) => ({ size: s, stock: Number(form.sizes[s]) || 0 }));
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        slug: form.slug.trim() || toSlug(form.title.trim()),
        description: form.description,
        priceINR: Number(form.priceINR),
        compareAtPriceINR: form.compareAtPriceINR ? Number(form.compareAtPriceINR) : null,
        weightGrams: form.weightGrams ? Number(form.weightGrams) : null,
        collectionId: form.collectionId,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
        isBestseller: form.isBestseller,
        isNewArrival: form.isNewArrival,
        newArrivalUntil: form.newArrivalUntil ? new Date(form.newArrivalUntil).toISOString() : null,
        variants,
        images: form.images,
        reelVideoUrl: form.reelVideoUrl,
        reelVideoPosterUrl: form.reelVideoPosterUrl,
      };
      const url = isEdit ? `/api/products/${(props as { mode: 'edit'; productId: string }).productId}` : '/api/products';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) { setFormError('A product with that slug already exists'); return; }
        setFormError(err.error || 'Something went wrong');
        return;
      }
      router.push('/admin?tab=products');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', padding: '40px 24px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link href="/admin?tab=products" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none',
          fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '20px',
        }}>
          <span style={{ display: 'inline-block', width: '16px', height: '1px', backgroundColor: 'currentColor', opacity: 0.5 }} />
          Back to Products
        </Link>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 24px' }}>
          {isEdit ? 'Edit Product' : 'New Product'}
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
              Product not found
            </p>
          ) : loading ? (
            <LoadingSkeleton rows={5} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FormField label="Title" required>
                <input style={inputStyle} value={form.title} onChange={(e) => onTitleChange(e.target.value)} placeholder="e.g. Floral Anarkali Kurta" />
              </FormField>

              <FormField label="Slug" required hint="Auto-generated from title.">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
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
                  placeholder="Product description…"
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <FormField label="Price (₹)" required>
                  <input style={inputStyle} type="number" value={form.priceINR} onChange={(e) => setForm((f) => ({ ...f, priceINR: e.target.value }))} min="0" placeholder="2499" />
                </FormField>
                <FormField label="Compare-at Price (₹)" hint="Shown as struck-through">
                  <input style={inputStyle} type="number" value={form.compareAtPriceINR} onChange={(e) => setForm((f) => ({ ...f, compareAtPriceINR: e.target.value }))} min="0" placeholder="3999" />
                </FormField>
                <FormField label="Weight (grams)" hint="Used for Shiprocket shipping">
                  <input style={inputStyle} type="number" value={form.weightGrams} onChange={(e) => setForm((f) => ({ ...f, weightGrams: e.target.value }))} min="0" placeholder="300" />
                </FormField>
              </div>

              <FormField label="Collection" required>
                <select style={selectStyle} value={form.collectionId} onChange={(e) => setForm((f) => ({ ...f, collectionId: e.target.value }))}>
                  <option value="">Select a collection</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Active">
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={toggleLabelStyle}>{form.isActive ? 'Visible' : 'Hidden'}</span>
                  </div>
                </FormField>
                <FormField label="Featured">
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={toggleLabelStyle}>{form.isFeatured ? 'Featured' : 'Normal'}</span>
                  </div>
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Bestseller">
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.isBestseller} onChange={(e) => setForm((f) => ({ ...f, isBestseller: e.target.checked }))} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={toggleLabelStyle}>{form.isBestseller ? 'Bestseller' : 'Normal'}</span>
                  </div>
                </FormField>
                <FormField label="New Arrival">
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.isNewArrival} onChange={(e) => setForm((f) => ({ ...f, isNewArrival: e.target.checked, newArrivalUntil: e.target.checked ? f.newArrivalUntil : '' }))} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={toggleLabelStyle}>{form.isNewArrival ? 'New Arrival' : 'Normal'}</span>
                  </div>
                </FormField>
              </div>

              {form.isNewArrival && (
                <FormField label="New Arrival Until" hint="Leave empty to keep it a new arrival indefinitely">
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={form.newArrivalUntil}
                    onChange={(e) => setForm((f) => ({ ...f, newArrivalUntil: e.target.value }))}
                  />
                </FormField>
              )}

              {/* Sizes / Stock */}
              <FormField label="Sizes & Stock">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  {SIZE_LABELS.map((size) => (
                    <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.55, textAlign: 'center' }}>
                        {size}
                      </span>
                      <input
                        style={{ ...inputStyle, textAlign: 'center', padding: '8px 4px' }}
                        type="number"
                        value={form.sizes[size]}
                        onChange={(e) => setForm((f) => ({ ...f, sizes: { ...f.sizes, [size]: e.target.value } }))}
                        min="0"
                      />
                    </div>
                  ))}
                </div>
              </FormField>

              {/* Images */}
              <FormField label="Images" hint="Upload up to 8. Drag to reorder. First image is the cover.">
                <ImageUploader
                  images={form.images}
                  onChange={(urls) => setForm((f) => ({ ...f, images: urls }))}
                />
              </FormField>

              {/* Reel Video */}
              <FormField label="Reel Video" hint="Optional short vertical video shown as a floating preview on the product page. MP4/MOV, max 40MB.">
                <VideoUploader
                  videoUrl={form.reelVideoUrl}
                  posterUrl={form.reelVideoPosterUrl}
                  onChange={({ videoUrl, posterUrl }) => setForm((f) => ({ ...f, reelVideoUrl: videoUrl, reelVideoPosterUrl: posterUrl }))}
                />
              </FormField>

              {formError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#dc2626', margin: 0 }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <Link href="/admin?tab=products" style={cancelBtnStyle}>Cancel</Link>
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
