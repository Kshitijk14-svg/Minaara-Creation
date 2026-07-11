'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminModal from './shared/AdminModal';
import FormField, { inputStyle } from './shared/FormField';
import AdminTable, { Td } from './shared/AdminTable';
import LoadingSkeleton from './shared/LoadingSkeleton';
import ConfirmInline from './shared/ConfirmInline';
import ImageUploader from './shared/ImageUploader';
import ProductPicker, { type PickableProduct } from './shared/ProductPicker';
import { localResize } from '@/lib/media';
import type { HaveliConfig, HaveliHotspot } from '@/types/schema';

const EMPTY_CONFIG: HaveliConfig = { imageUrl: '', heading: '', subheading: '', description: '' };
const DRAG_CLICK_THRESHOLD = 4;

export default function HaveliTab() {
  const [config, setConfig]           = useState<HaveliConfig>(EMPTY_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving]   = useState(false);
  const [configSaved, setConfigSaved]     = useState(false);

  const [hotspots, setHotspots]       = useState<HaveliHotspot[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(true);

  const [pendingPin, setPendingPin]   = useState<{ x: number; y: number } | null>(null);
  const [editingPin, setEditingPin]   = useState<HaveliHotspot | null>(null);
  const [pinSaving, setPinSaving]     = useState(false);
  const [pinError, setPinError]       = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragPos, setDragPos]         = useState<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/config/design');
      if (res.ok) {
        const data = await res.json();
        if (data.haveliConfig) setConfig(data.haveliConfig);
      }
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchHotspots = useCallback(async () => {
    setHotspotsLoading(true);
    try {
      const res = await fetch('/api/haveli-hotspots');
      if (res.ok) {
        const data = await res.json();
        setHotspots(data.hotspots ?? []);
      }
    } finally {
      setHotspotsLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); fetchHotspots(); }, [fetchConfig, fetchHotspots]);

  const saveConfig = async () => {
    setConfigSaving(true); setConfigSaved(false);
    try {
      const res = await fetch('/api/config/design', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haveliConfig: config }),
      });
      if (res.ok) { setConfigSaved(true); setTimeout(() => setConfigSaved(false), 2000); }
    } finally {
      setConfigSaving(false);
    }
  };

  function coordsFromEvent(e: React.MouseEvent | React.PointerEvent): { x: number; y: number } {
    const rect = imageBoxRef.current!.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function handleImageClick(e: React.MouseEvent) {
    if (!config.imageUrl || hasDraggedRef.current) return;
    setPendingPin(coordsFromEvent(e));
  }

  async function handleAssignProduct(product: PickableProduct) {
    if (!pendingPin) return;
    setPinSaving(true); setPinError('');
    try {
      const res = await fetch('/api/haveli-hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, x: pendingPin.x, y: pendingPin.y }),
      });
      if (!res.ok) { const d = await res.json(); setPinError(d.error ?? 'Failed to add pin'); return; }
      setPendingPin(null);
      fetchHotspots();
    } finally {
      setPinSaving(false);
    }
  }

  async function handleReassignProduct(product: PickableProduct) {
    if (!editingPin) return;
    setPinSaving(true); setPinError('');
    try {
      const res = await fetch(`/api/haveli-hotspots/${editingPin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      if (!res.ok) { const d = await res.json(); setPinError(d.error ?? 'Failed to update pin'); return; }
      setEditingPin(null);
      fetchHotspots();
    } finally {
      setPinSaving(false);
    }
  }

  async function handleDeletePin() {
    if (!editingPin) return;
    setPinSaving(true);
    try {
      await fetch(`/api/haveli-hotspots/${editingPin.id}`, { method: 'DELETE' });
      setEditingPin(null); setDeleteConfirm(false);
      fetchHotspots();
    } finally {
      setPinSaving(false);
    }
  }

  // ── Drag-to-reposition existing pins ────────────────────────────────────────
  function handlePinPointerDown(e: React.PointerEvent, hotspot: HaveliHotspot) {
    e.stopPropagation();
    hasDraggedRef.current = false;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
    dragPosRef.current = { x: hotspot.x, y: hotspot.y };
    setDraggingId(hotspot.id);
    setDragPos({ x: hotspot.x, y: hotspot.y });
  }

  useEffect(() => {
    if (!draggingId) return;

    function handleMove(e: PointerEvent) {
      if (!imageBoxRef.current) return;
      const start = dragStartRef.current;
      if (start) {
        const dist = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);
        if (dist < DRAG_CLICK_THRESHOLD) return;
        hasDraggedRef.current = true;
      }
      const rect = imageBoxRef.current.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
      const next = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      dragPosRef.current = next;
      setDragPos(next);
    }

    async function handleUp() {
      const id = draggingId;
      const finalPos = dragPosRef.current;
      setDraggingId(null);
      dragStartRef.current = null;
      if (id && finalPos && hasDraggedRef.current) {
        setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, x: finalPos.x, y: finalPos.y } : h)));
        await fetch(`/api/haveli-hotspots/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: finalPos.x, y: finalPos.y }),
        });
      }
      setTimeout(() => { hasDraggedRef.current = false; }, 0);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingId]);

  function openEditPin(e: React.PointerEvent, hotspot: HaveliHotspot) {
    if (hasDraggedRef.current) return;
    e.stopPropagation();
    setEditingPin(hotspot);
    setPinError('');
    setDeleteConfirm(false);
  }

  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
          The Haveli Edit
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.55, margin: '6px 0 0' }}>
          The homepage interactive lookbook banner — set the background image and copy, then click anywhere on the image to place a shoppable pin.
        </p>
      </div>

      {configLoading ? <LoadingSkeleton rows={3} /> : (
        <div style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-card-border)', borderRadius: '12px', padding: '24px', marginBottom: '28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <FormField label="Section Image">
            <ImageUploader
              images={config.imageUrl ? [config.imageUrl] : []}
              onChange={(urls) => setConfig((c) => ({ ...c, imageUrl: urls[0] ?? '' }))}
              maxImages={1}
            />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FormField label="Heading">
              <input value={config.heading} onChange={(e) => setConfig((c) => ({ ...c, heading: e.target.value }))} placeholder="The Haveli Edit" style={inputStyle} />
            </FormField>
            <FormField label="Subheading">
              <input value={config.subheading} onChange={(e) => setConfig((c) => ({ ...c, subheading: e.target.value }))} placeholder="✦ Interactive Lookbook" style={inputStyle} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea value={config.description} onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
              rows={2} placeholder="Hover over the gold pins to discover signature ensembles…" style={{ ...inputStyle, resize: 'vertical' }} />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
            {configSaved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#2E7D32' }}>Saved</span>}
            <button onClick={saveConfig} disabled={configSaving} style={{ padding: '10px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: configSaving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', opacity: configSaving ? 0.7 : 1 }}>
              {configSaving ? 'Saving…' : 'Save Section Content'}
            </button>
          </div>
        </div>
      )}

      {/* ── Live spot picker ── */}
      {config.imageUrl ? (
        <div
          ref={imageBoxRef}
          onClick={handleImageClick}
          style={{
            position: 'relative', width: '100%', aspectRatio: '2 / 1', borderRadius: '12px',
            overflow: 'hidden', cursor: 'crosshair', marginBottom: '20px',
            border: '1px solid var(--admin-card-border)', backgroundColor: '#1A1A1A',
          }}
        >
          <img src={config.imageUrl} alt="Haveli section" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />

          {hotspots.map((h) => {
            const pos = draggingId === h.id && dragPos ? dragPos : h;
            return (
              <div
                key={h.id}
                onPointerDown={(e) => handlePinPointerDown(e, h)}
                onPointerUp={(e) => openEditPin(e, h)}
                onClick={(e) => e.stopPropagation()}
                title={h.product?.title ?? 'Untitled pin'}
                style={{
                  position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: draggingId === h.id ? '#C4AC70' : 'rgba(255,255,255,0.9)',
                  border: '2px solid #1A1A1A', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  cursor: draggingId === h.id ? 'grabbing' : 'grab',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: '#1A1A1A', touchAction: 'none',
                  zIndex: draggingId === h.id ? 30 : 20,
                }}
              >
                •
              </div>
            );
          })}

          {pendingPin && (
            <div style={{
              position: 'absolute', left: `${pendingPin.x}%`, top: `${pendingPin.y}%`,
              transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%',
              backgroundColor: 'rgba(196,172,112,0.9)', border: '2px dashed #fff',
              zIndex: 25, pointerEvents: 'none',
            }} />
          )}

          <p style={{ position: 'absolute', bottom: '10px', left: '12px', margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'rgba(255,255,255,0.7)', pointerEvents: 'none' }}>
            Click to add a pin · Drag a pin to reposition · Click a pin to edit
          </p>
        </div>
      ) : (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.5, border: '1px dashed var(--color-brand-mist)', borderRadius: '12px', marginBottom: '20px' }}>
          Upload a section image above to start placing pins.
        </div>
      )}

      {/* ── Accessible list view ── */}
      {hotspotsLoading ? <LoadingSkeleton rows={3} /> : (
        <AdminTable
          headers={['Product', 'X %', 'Y %', '']}
          isEmpty={hotspots.length === 0}
          empty={<p style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>No pins yet. Click the image above to add one.</p>}
        >
          {hotspots.map((h) => (
            <tr key={h.id} style={{ borderBottom: '1px solid var(--color-brand-mist)' }}>
              <Td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {h.product?.images?.[0] && (
                    <img src={localResize(h.product.images[0], 80)} alt={h.product.title} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '4px' }} />
                  )}
                  <span>{h.product?.title ?? 'Unknown product'}</span>
                </div>
              </Td>
              <Td mono>{h.x.toFixed(1)}</Td>
              <Td mono>{h.y.toFixed(1)}</Td>
              <Td right>
                <button
                  onClick={() => { setEditingPin(h); setPinError(''); setDeleteConfirm(false); }}
                  style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}
                >
                  Edit
                </button>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      {/* ── Assign product to a new pin ── */}
      <AdminModal isOpen={!!pendingPin} onClose={() => setPendingPin(null)} title="Assign Product to Pin" width="480px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <ProductPicker onSelect={handleAssignProduct} autoFocus placeholder="Search products to pin here…" />
          {pinSaving && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.5 }}>Saving…</p>}
          {pinError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#C0392B' }}>{pinError}</p>}
        </div>
      </AdminModal>

      {/* ── Edit / delete an existing pin ── */}
      <AdminModal isOpen={!!editingPin} onClose={() => setEditingPin(null)} title="Edit Pin" width="480px">
        {editingPin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', border: '1px solid var(--color-brand-mist)', borderRadius: '8px' }}>
              {editingPin.product?.images?.[0] && (
                <img src={localResize(editingPin.product.images[0], 120)} alt={editingPin.product.title} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '6px' }} />
              )}
              <div>
                <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-brand-charcoal)' }}>{editingPin.product?.title ?? 'Unknown product'}</p>
                <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: '11px', opacity: 0.5 }}>x: {editingPin.x.toFixed(1)}% · y: {editingPin.y.toFixed(1)}%</p>
              </div>
            </div>

            <FormField label="Change Product">
              <ProductPicker onSelect={handleReassignProduct} placeholder="Search to reassign…" />
            </FormField>

            {pinError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#C0392B' }}>{pinError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {deleteConfirm ? (
                <ConfirmInline onConfirm={handleDeletePin} onCancel={() => setDeleteConfirm(false)} label="Delete this pin?" loading={pinSaving} />
              ) : (
                <button onClick={() => setDeleteConfirm(true)} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #FCA5A5', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: '#C0392B' }}>
                  Delete Pin
                </button>
              )}
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
