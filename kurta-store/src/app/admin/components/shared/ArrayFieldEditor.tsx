'use client';

import React from 'react';

interface ArrayFieldEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
  emptyItem: T;
  itemLabel?: (item: T, index: number) => string;
  addLabel?: string;
  max?: number;
  min?: number;
}

/**
 * Generic add/remove list editor for the fixed-shape homepage content arrays
 * (USP items, marquee words, About panels, Editorial stories, stats, footer
 * links) — mirrors the row card + add-button pattern DesignTab already uses
 * for Hero Banners, so every array-of-objects field in Design gets the same
 * interaction without repeating the markup per section.
 */
export default function ArrayFieldEditor<T>({
  items, onChange, renderItem, emptyItem, itemLabel, addLabel = '+ Add Item', max, min = 0,
}: ArrayFieldEditorProps<T>) {
  const update = (i: number, patch: Partial<T>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const add = () => onChange([...items, { ...emptyItem }]);

  const canAdd = max === undefined || items.length < max;
  const canRemove = items.length > min;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
              {itemLabel ? itemLabel(item, i) : `Item ${i + 1}`}
            </span>
            {canRemove && (
              <button onClick={() => remove(i)} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#C0392B', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                Remove
              </button>
            )}
          </div>
          {renderItem(item, i, (patch) => update(i, patch))}
        </div>
      ))}

      {canAdd && (
        <button
          onClick={add}
          style={{ padding: '14px', borderRadius: '10px', border: '1.5px dashed var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, transition: 'opacity 0.2s' }}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}
