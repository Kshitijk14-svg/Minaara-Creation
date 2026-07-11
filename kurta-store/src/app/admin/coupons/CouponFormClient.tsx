'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FormField, { inputStyle, selectStyle } from '../components/shared/FormField';
import LoadingSkeleton from '../components/shared/LoadingSkeleton';

interface CouponForm {
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: string;
  minOrderAmountINR: string;
  maxDiscountINR: string;
  maxUses: string;
  perUserLimit: string;
  expiryDate: string;
  isActive: boolean;
}

const emptyForm: CouponForm = {
  code: '', discountType: 'PERCENT', discountValue: '',
  minOrderAmountINR: '0', maxDiscountINR: '', maxUses: '',
  perUserLimit: '1', expiryDate: '', isActive: true,
};

type CouponFormClientProps =
  | { mode: 'create' }
  | { mode: 'edit'; couponId: string };

export default function CouponFormClient(props: CouponFormClientProps) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';

  const [form, setForm]           = useState<CouponForm>(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading]     = useState(isEdit);
  const [notFound, setNotFound]   = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    const couponId = (props as { mode: 'edit'; couponId: string }).couponId;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/coupons/${couponId}`);
        if (res.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!res.ok) throw new Error();
        const { coupon: c } = await res.json();
        if (cancelled) return;
        setForm({
          code: c.code,
          discountType: c.discountType,
          discountValue: String(c.discountValue),
          minOrderAmountINR: String(c.minOrderAmountINR),
          maxDiscountINR: c.maxDiscountINR ? String(c.maxDiscountINR) : '',
          maxUses: c.maxUses ? String(c.maxUses) : '',
          perUserLimit: String(c.perUserLimit),
          expiryDate: c.expiryDate?.slice(0, 10) || '',
          isActive: c.isActive,
        });
      } catch {
        if (!cancelled) setFormError('Failed to load coupon');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  async function handleSave() {
    setFormError(null);
    if (!form.code.trim()) { setFormError('Code is required'); return; }
    if (!form.discountValue || isNaN(Number(form.discountValue))) { setFormError('Discount value is required'); return; }
    if (!form.expiryDate) { setFormError('Expiry date is required'); return; }
    if (form.discountType === 'PERCENT' && (Number(form.discountValue) < 1 || Number(form.discountValue) > 100)) {
      setFormError('Percent discount must be 1–100'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(isEdit ? { id: (props as { mode: 'edit'; couponId: string }).couponId } : {}),
        code: form.code.toUpperCase().trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmountINR: Number(form.minOrderAmountINR) || 0,
        maxDiscountINR: form.maxDiscountINR ? Number(form.maxDiscountINR) : undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        perUserLimit: Number(form.perUserLimit) || 1,
        expiryDate: form.expiryDate,
        isActive: form.isActive,
      };
      const res = await fetch('/api/coupons', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) { setFormError('Coupon code already exists'); return; }
        setFormError(err.error || 'Something went wrong');
        return;
      }
      router.push('/admin?tab=coupons');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', padding: '40px 24px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link href="/admin?tab=coupons" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none',
          fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '20px',
        }}>
          <span style={{ display: 'inline-block', width: '16px', height: '1px', backgroundColor: 'currentColor', opacity: 0.5 }} />
          Back to Coupons
        </Link>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 24px' }}>
          {isEdit ? 'Edit Coupon' : 'New Coupon'}
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
              Coupon not found
            </p>
          ) : loading ? (
            <LoadingSkeleton rows={5} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FormField label="Code" required>
                <input
                  style={inputStyle}
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="SUMMER20"
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Discount Type" required>
                  <select
                    style={selectStyle}
                    value={form.discountType}
                    onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as 'PERCENT' | 'FIXED' }))}
                  >
                    <option value="PERCENT">Percent (%)</option>
                    <option value="FIXED">Fixed (₹)</option>
                  </select>
                </FormField>
                <FormField label={form.discountType === 'PERCENT' ? 'Discount %' : 'Discount ₹'} required>
                  <input
                    style={inputStyle}
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    min="0"
                    max={form.discountType === 'PERCENT' ? '100' : undefined}
                    placeholder={form.discountType === 'PERCENT' ? '10' : '200'}
                  />
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Min Order (₹)">
                  <input style={inputStyle} type="number" value={form.minOrderAmountINR} onChange={(e) => setForm((f) => ({ ...f, minOrderAmountINR: e.target.value }))} min="0" placeholder="0" />
                </FormField>
                {form.discountType === 'PERCENT' && (
                  <FormField label="Max Discount (₹)" hint="Optional cap">
                    <input style={inputStyle} type="number" value={form.maxDiscountINR} onChange={(e) => setForm((f) => ({ ...f, maxDiscountINR: e.target.value }))} min="0" placeholder="500" />
                  </FormField>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Max Total Uses" hint="Leave blank for unlimited">
                  <input style={inputStyle} type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} min="1" placeholder="∞" />
                </FormField>
                <FormField label="Per-User Limit">
                  <input style={inputStyle} type="number" value={form.perUserLimit} onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))} min="1" placeholder="1" />
                </FormField>
              </div>

              <FormField label="Expiry Date" required>
                <input style={inputStyle} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </FormField>

              <FormField label="Active">
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '6px' }}>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                    <span className="toggle-slider" />
                  </label>
                  <span style={toggleLabelStyle}>{form.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </FormField>

              {formError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#dc2626', margin: 0 }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <Link href="/admin?tab=coupons" style={cancelBtnStyle}>Cancel</Link>
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

const toggleLabelStyle: React.CSSProperties = {
  marginLeft: '12px', fontFamily: 'var(--font-body)', fontSize: '12px',
  color: 'var(--color-brand-charcoal)', opacity: 0.6,
};
