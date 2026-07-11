'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '@/types/schema';
import AdminTable, { Td } from './shared/AdminTable';
import ConfirmInline from './shared/ConfirmInline';
import LoadingSkeleton from './shared/LoadingSkeleton';

interface CollectionsTabProps {
  role: string;
  initialData?: any;
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CollectionsTab({ role, initialData }: CollectionsTabProps) {
  const canWrite = role !== 'STAFF';
  const router = useRouter();

  const [collections, setCollections] = useState<Collection[]>(initialData?.data ?? []);
  const [loading, setLoading]         = useState(!initialData);
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

  useEffect(() => {
    if (!initialData) { fetchCollections(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCollections]);

  function openCreate() {
    router.push('/admin/collections/new');
  }

  function openEdit(col: Collection) {
    router.push(`/admin/collections/${col.id}/edit`);
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
    </div>
  );
}
