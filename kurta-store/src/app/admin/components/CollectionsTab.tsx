'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '@/types/schema';
import AdminTable, { Td } from './shared/AdminTable';
import AdminModal from './shared/AdminModal';
import ConfirmInline from './shared/ConfirmInline';
import FormField, { inputStyle, selectStyle } from './shared/FormField';
import LoadingSkeleton from './shared/LoadingSkeleton';

interface CollectionsTabProps {
  role: string;
}

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

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CollectionsTab({ role }: CollectionsTabProps) {
  const canWrite = role !== 'STAFF';

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Collection | null>(null);
  const [form, setForm]               = useState<CollectionForm>(emptyForm);
  const [slugLocked, setSlugLocked]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/collections?includeInactive=true');
      const data = await res.json();
      setCollections(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSlugLocked(false);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(col: Collection) {
    setEditing(col);
    setForm({
      name: col.name, slug: col.slug,
      description: col.description || '',
      imageUrl: col.imageUrl || '',
      sortOrder: String(col.sortOrder),
      isActive: col.isActive,
    });
    setSlugLocked(true);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function onNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: slugLocked ? f.slug : toSlug(name),
    }));
  }

  async function handleToggleActive(col: Collection) {
    const optimistic = collections.map((c) =>
      c.id === col.id ? { ...c, isActive: !c.isActive } : c
    );
    setCollections(optimistic);
    try {
      const res = await fetch('/api/collections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: col.id, isActive: !col.isActive }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCollections(collections); // revert
    }
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.slug.trim()) { setFormError('Slug is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        sortOrder: parseInt(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      const res = await fetch('/api/collections', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) { setFormError('A collection with that name or slug already exists'); return; }
        setFormError(err.error || 'Something went wrong');
        return;
      }
      await fetchCollections();
      closeModal();
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
      const res = await fetch(`/api/collections?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Delete failed');
        return;
      }
      if (data.message && data.message.includes('deactivated')) {
        // Soft deactivated
        setCollections((prev) => prev.map((c) => c.id === id ? { ...c, isActive: false } : c));
      } else {
        // Hard deleted
        setCollections((prev) => prev.filter((c) => c.id !== id));
      }
      setDeleteId(null);
    } catch {
      setDeleteError('Network error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
            Collections
          </h2>
          {!loading && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
              {collections.length} total
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
            + Add Collection
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <AdminTable
          headers={['Name', 'Slug', 'Active', 'Products', 'Sort', 'Created', 'Actions']}
          isEmpty={collections.length === 0}
        >
          {collections.map((col, i) => (
            <React.Fragment key={col.id}>
              <motion.tr
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="admin-row-hover"
              >
                <Td>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
                    {col.name}
                  </span>
                </Td>
                <Td mono style={{ opacity: 0.6 }}>{col.slug}</Td>
                <Td>
                  <label className="toggle-switch" style={{ cursor: canWrite ? 'pointer' : 'not-allowed' }}>
                    <input
                      type="checkbox"
                      checked={col.isActive}
                      onChange={() => canWrite && handleToggleActive(col)}
                      disabled={!canWrite}
                    />
                    <span className="toggle-slider" />
                  </label>
                </Td>
                <Td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {col._count?.products ?? 0}
                  </span>
                </Td>
                <Td mono style={{ opacity: 0.6 }}>{col.sortOrder}</Td>
                <Td style={{ opacity: 0.55, fontSize: '12px' }}>{formatDate(col.createdAt)}</Td>
                <Td>
                  <AnimatePresence mode="wait">
                    {deleteId === col.id ? (
                      <ConfirmInline
                        label={deleteError || 'Delete this collection?'}
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(col.id)}
                        onCancel={() => { setDeleteId(null); setDeleteError(null); }}
                        error={deleteError}
                        loading={deleting}
                      />
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                      >
                        <button
                          onClick={() => openEdit(col)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)', opacity: 0.6, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                          className="admin-action-btn"
                        >
                          Edit
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => { setDeleteId(col.id); setDeleteError(null); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: '#dc2626', opacity: 0.55, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                            className="admin-action-btn"
                          >
                            Delete
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Td>
              </motion.tr>
            </React.Fragment>
          ))}
        </AdminTable>
      )}

      {/* Create / Edit Modal */}
      <AdminModal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Collection' : 'New Collection'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <FormField label="Name" required>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Summer Kurtas"
            />
          </FormField>

          <FormField label="Slug" required hint="Auto-generated from name. Used in URLs.">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="summer-kurtas"
              />
              <button
                type="button"
                onClick={() => setSlugLocked((l) => !l)}
                style={{
                  flexShrink: 0, padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--color-brand-mist)',
                  background: slugLocked ? 'rgba(15,42,91,0.06)' : 'none',
                  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--color-brand-charcoal)', cursor: 'pointer',
                  opacity: 0.7,
                }}
              >
                {slugLocked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          </FormField>

          <FormField label="Description">
            <textarea
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' } as React.CSSProperties}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this collection"
            />
          </FormField>

          <FormField label="Image URL">
            <input
              style={inputStyle}
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://..."
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormField label="Sort Order">
              <input
                style={inputStyle}
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                min="0"
              />
            </FormField>
            <FormField label="Active">
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </label>
                <span style={{ marginLeft: '12px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                  {form.isActive ? 'Visible in store' : 'Hidden'}
                </span>
              </div>
            </FormField>
          </div>

          {formError && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#dc2626', margin: 0 }}>
              {formError}
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button
              onClick={closeModal}
              style={{
                padding: '10px 18px', borderRadius: '6px',
                border: '1px solid var(--color-brand-mist)',
                background: 'none', fontFamily: 'var(--font-body)', fontSize: '10px',
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--color-brand-charcoal)', opacity: 0.6, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: 'none',
                background: 'var(--color-brand-charcoal)', color: '#fff',
                fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
              className="btn-liquid"
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
