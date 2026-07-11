'use client';

import React, { useEffect, useState, useCallback } from 'react';
import AdminModal from './shared/AdminModal';
import FormField, { inputStyle, selectStyle } from './shared/FormField';
import StatusBadge from './shared/StatusBadge';
import AdminTable from './shared/AdminTable';
import LoadingSkeleton from './shared/LoadingSkeleton';
import ConfirmInline from './shared/ConfirmInline';

interface Testimonial {
  id: string; name: string; city: string | null; text: string;
  rating: number; isActive: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}

const EMPTY_FORM = {
  name: '', city: '', text: '', rating: 5, isActive: true, sortOrder: 0,
};

export default function TestimonialsTab() {
  const [items, setItems]             = useState<Testimonial[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Testimonial | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [confirmId, setConfirmId]     = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/testimonials');
      const data = await res.json();
      if (res.ok) setItems(data.testimonials ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, sortOrder: items.length }); setError(''); setModalOpen(true); };
  const openEdit   = (t: Testimonial) => {
    setEditing(t);
    setForm({ name: t.name, city: t.city ?? '', text: t.text, rating: t.rating, isActive: t.isActive, sortOrder: t.sortOrder });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.text.trim()) { setError('Name and review text are required.'); return; }
    setSaving(true); setError('');
    try {
      const url    = editing ? `/api/testimonials/${editing.id}` : '/api/testimonials';
      const method = editing ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      form.name,
          city:      form.city || undefined,
          text:      form.text,
          rating:    form.rating,
          isActive:  form.isActive,
          sortOrder: form.sortOrder,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save testimonial'); return; }
      setModalOpen(false);
      fetchItems();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: Testimonial) => {
    await fetch(`/api/testimonials/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !t.isActive }) });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/testimonials/${id}`, { method: 'DELETE' });
    setConfirmId(null);
    fetchItems();
  };

  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
          Testimonials
        </h2>
        <button onClick={openCreate} style={{ padding: '10px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
          + New Testimonial
        </button>
      </div>

      {loading ? <LoadingSkeleton rows={5} /> : (
        <AdminTable
          headers={['Name', 'City', 'Rating', 'Status', 'Sort', '']}
          isEmpty={items.length === 0}
          empty={<p style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>No testimonials yet. Add your first customer review.</p>}
        >
          {items.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--color-brand-mist)' }}>
              <td style={{ padding: '14px 16px' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: 0 }}>{t.name}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: '2px 0 0', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</p>
              </td>
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                {t.city || '—'}
              </td>
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '13px', color: '#C4AC70' }}>
                {'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}
              </td>
              <td style={{ padding: '14px 16px' }}>
                <StatusBadge status={t.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </td>
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                {t.sortOrder}
              </td>
              <td style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => toggleActive(t)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: t.isActive ? '#C0392B' : 'var(--color-brand-mauve)' }}>
                    {t.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => openEdit(t)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>
                    Edit
                  </button>
                  {confirmId === t.id ? (
                    <ConfirmInline onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmId(null)} label="Delete?" />
                  ) : (
                    <button onClick={() => setConfirmId(t.id)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid #FCA5A5', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: '#C0392B' }}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {/* Create / Edit Modal */}
      <AdminModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Testimonial' : 'New Testimonial'} width="560px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <FormField label="Name" required error={!form.name && error ? 'Required' : undefined}>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Priya Sharma" style={inputStyle} />
            </FormField>
            <FormField label="City">
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Mumbai" style={inputStyle} />
            </FormField>
          </div>

          <FormField label="Review Text" required error={!form.text && error ? 'Required' : undefined}>
            <textarea value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              placeholder="The quality is unlike anything I've found online…" rows={4}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Rating">
              <select value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))} style={selectStyle}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</option>)}
              </select>
            </FormField>
            <FormField label="Sort Order" hint="Lower shows first">
              <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} style={inputStyle} />
            </FormField>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)' }}>
              {form.isActive ? 'Active (visible on homepage)' : 'Inactive (hidden)'}
            </span>
          </label>

          {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#C0392B' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
            <button onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', border: '1px solid var(--color-brand-mist)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Testimonial'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
