'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product, Collection, SizeLabel } from '@/types/schema';
import AdminTable, { Td } from './shared/AdminTable';
import AdminModal from './shared/AdminModal';
import ConfirmInline from './shared/ConfirmInline';
import FormField, { inputStyle, selectStyle } from './shared/FormField';
import LoadingSkeleton from './shared/LoadingSkeleton';
import StatusBadge from './shared/StatusBadge';

interface ProductsTabProps {
  role: string;
}

const SIZE_LABELS: SizeLabel[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface ProductForm {
  title: string;
  slug: string;
  description: string;
  priceINR: string;
  compareAtPriceINR: string;
  collectionId: string;
  isActive: boolean;
  isFeatured: boolean;
  sizes: Record<SizeLabel, string>;
  images: string; // newline-separated URLs
}

const emptyForm: ProductForm = {
  title: '', slug: '', description: '',
  priceINR: '', compareAtPriceINR: '',
  collectionId: '', isActive: true, isFeatured: false,
  sizes: { XS: '0', S: '0', M: '0', L: '0', XL: '0', XXL: '0' },
  images: '',
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProductsTab({ role }: ProductsTabProps) {
  const canWrite = role !== 'STAFF';

  const [products, setProducts]       = useState<Product[]>([]);
  const [total, setTotal]             = useState(0);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Product | null>(null);
  const [form, setForm]               = useState<ProductForm>(emptyForm);
  const [slugLocked, setSlugLocked]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = useCallback(async (q: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (q) params.set('search', q);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (cursor) {
        setProducts((prev) => [...prev, ...(data.data || [])]);
      } else {
        setProducts(data.data || []);
      }
      setTotal(data.total ?? 0);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/collections?includeInactive=true')
      .then((r) => r.json())
      .then((d) => setCollections(d.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { fetchProducts(search); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, fetchProducts]);

  function openCreate() {
    setEditing(null); setForm(emptyForm); setSlugLocked(false); setFormError(null); setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    const sizes: Record<SizeLabel, string> = { XS: '0', S: '0', M: '0', L: '0', XL: '0', XXL: '0' };
    SIZE_LABELS.forEach((s) => { sizes[s] = String(p.sizes?.[s] ?? 0); });
    setForm({
      title: p.title,
      slug: p.slug,
      description: p.description,
      priceINR: String(p.priceINR),
      compareAtPriceINR: p.compareAtPriceINR ? String(p.compareAtPriceINR) : '',
      collectionId: p.collectionId || '',
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      sizes,
      images: (p.images || []).join('\n'),
    });
    setSlugLocked(true);
    setFormError(null);
    setModalOpen(true);
  }

  function onTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugLocked ? f.slug : toSlug(title) }));
  }

  async function handleSave() {
    setFormError(null);
    if (!form.title.trim()) { setFormError('Title is required'); return; }
    if (!form.priceINR || isNaN(Number(form.priceINR))) { setFormError('Price is required'); return; }
    if (!form.collectionId) { setFormError('Collection is required'); return; }
    setSaving(true);
    try {
      const variants = SIZE_LABELS.map((s) => ({ size: s, stock: Number(form.sizes[s]) || 0 }));
      const images = form.images.split('\n').map((u) => u.trim()).filter(Boolean);
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        slug: form.slug.trim() || toSlug(form.title.trim()),
        description: form.description,
        priceINR: Number(form.priceINR),
        compareAtPriceINR: form.compareAtPriceINR ? Number(form.compareAtPriceINR) : null,
        collectionId: form.collectionId,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
        variants,
        images,
      };
      const url = editing ? `/api/products/${editing.id}` : '/api/products';
      const method = editing ? 'PATCH' : 'POST';
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
      await fetchProducts(search);
      setModalOpen(false);
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setDeleteError(err.error || 'Delete failed');
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setDeleteId(null);
    } catch { setDeleteError('Network error'); }
    finally { setDeleting(false); }
  }

  const totalStock = (p: Product) => Object.values(p.sizes || {}).reduce((s, n) => s + (n || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
            Products
          </h2>
          {!loading && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
              {total} total (excluding deleted)
            </p>
          )}
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'var(--color-brand-charcoal)', color: '#fff',
              padding: '10px 18px', borderRadius: '6px', border: 'none',
              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer',
            }}
            className="btn-liquid"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          style={{ ...inputStyle, maxWidth: '320px' }}
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && products.length === 0 ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <AdminTable
          headers={['', 'Title', 'Collection', 'Price', 'Stock', 'Status', 'Featured', 'Created', 'Actions']}
          isEmpty={products.length === 0}
        >
          {products.map((p, i) => (
            <motion.tr
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="admin-row-hover"
            >
              {/* Thumbnail */}
              <Td style={{ width: '52px', padding: '10px 8px 10px 16px' }}>
                {p.images?.[0] ? (
                  <img
                    src={p.images[0]}
                    alt={p.title}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '6px', display: 'block', background: 'var(--color-brand-mist)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: '6px', background: 'var(--color-brand-mist)' }} />
                )}
              </Td>
              <Td>
                <span style={{ fontWeight: 500, fontSize: '13px', display: 'block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>
                  {p.slug}
                </span>
              </Td>
              <Td style={{ opacity: 0.65, fontSize: '12px' }}>{p.collection?.name || p.category || '—'}</Td>
              <Td mono>
                ₹{p.priceINR.toLocaleString('en-IN')}
                {p.compareAtPriceINR && (
                  <span style={{ fontSize: '10px', opacity: 0.45, marginLeft: '4px', textDecoration: 'line-through' }}>
                    ₹{p.compareAtPriceINR.toLocaleString('en-IN')}
                  </span>
                )}
              </Td>
              <Td mono style={{ opacity: 0.7 }}>{totalStock(p)}</Td>
              <Td>
                <StatusBadge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} type="order" />
              </Td>
              <Td>
                {p.isFeatured && (
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-body)', color: '#A68026', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    ★
                  </span>
                )}
              </Td>
              <Td style={{ opacity: 0.55, fontSize: '12px' }}>{formatDate(p.createdAt)}</Td>
              <Td>
                <AnimatePresence mode="wait">
                  {deleteId === p.id ? (
                    <ConfirmInline
                      label={deleteError || 'Delete this product?'}
                      confirmLabel="Delete"
                      onConfirm={() => handleDelete(p.id)}
                      onCancel={() => { setDeleteId(null); setDeleteError(null); }}
                      error={deleteError}
                      loading={deleting}
                    />
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openEdit(p)} style={actionBtnStyle}>Edit</button>
                      {canWrite && (
                        <button onClick={() => { setDeleteId(p.id); setDeleteError(null); }} style={{ ...actionBtnStyle, color: '#dc2626' }}>
                          Delete
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Td>
            </motion.tr>
          ))}
        </AdminTable>
      )}

      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={() => fetchProducts(search, nextCursor!)} style={{ ...actionBtnStyle, opacity: 0.7, padding: '8px 20px' }}>
            Load more
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      <AdminModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'New Product'} width="640px">
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormField label="Price (₹)" required>
              <input style={inputStyle} type="number" value={form.priceINR} onChange={(e) => setForm((f) => ({ ...f, priceINR: e.target.value }))} min="0" placeholder="2499" />
            </FormField>
            <FormField label="Compare-at Price (₹)" hint="Shown as struck-through">
              <input style={inputStyle} type="number" value={form.compareAtPriceINR} onChange={(e) => setForm((f) => ({ ...f, compareAtPriceINR: e.target.value }))} min="0" placeholder="3999" />
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

          {/* Image URLs */}
          <FormField label="Image URLs" hint="One URL per line">
            <textarea
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' } as React.CSSProperties}
              value={form.images}
              onChange={(e) => setForm((f) => ({ ...f, images: e.target.value }))}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
            />
          </FormField>

          {formError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#dc2626', margin: 0 }}>{formError}</p>}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button onClick={() => setModalOpen(false)} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="btn-liquid">
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
  color: 'var(--color-brand-charcoal)', opacity: 0.6,
  padding: '4px 8px', borderRadius: '4px',
  textTransform: 'uppercase', letterSpacing: '0.1em',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '6px',
  border: '1px solid var(--color-brand-mist)',
  background: 'none', fontFamily: 'var(--font-body)', fontSize: '10px',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
  color: 'var(--color-brand-charcoal)', opacity: 0.6, cursor: 'pointer',
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
