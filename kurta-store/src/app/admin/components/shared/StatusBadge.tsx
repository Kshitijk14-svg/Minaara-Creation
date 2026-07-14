'use client';

import React from 'react';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RTO_INITIATED' | 'RTO_DELIVERED' | 'CANCELLED' | 'REFUNDED';
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

function getOrderStatusColor(status: string) {
  switch (status) {
    case 'PENDING':          return { bg: 'rgba(166,128,38,0.08)', color: '#A68026', border: 'rgba(166,128,38,0.2)' };
    case 'CONFIRMED':        return { bg: 'rgba(50,81,140,0.08)', color: '#32518C', border: 'rgba(50,81,140,0.2)' };
    case 'PROCESSING':       return { bg: 'rgba(50,81,140,0.08)', color: '#32518C', border: 'rgba(50,81,140,0.2)' };
    case 'SHIPPED':          return { bg: 'rgba(79,70,229,0.08)', color: '#4f46e5', border: 'rgba(79,70,229,0.2)' };
    case 'OUT_FOR_DELIVERY': return { bg: 'rgba(37,99,235,0.08)', color: '#2563eb', border: 'rgba(37,99,235,0.2)' };
    case 'DELIVERED':        return { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', border: 'rgba(34,197,94,0.2)' };
    case 'RTO_INITIATED':    return { bg: 'rgba(217,119,6,0.08)', color: '#d97706', border: 'rgba(217,119,6,0.2)' };
    case 'RTO_DELIVERED':    return { bg: 'rgba(148,88,88,0.08)', color: '#945858', border: 'rgba(148,88,88,0.2)' };
    case 'CANCELLED':        return { bg: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'rgba(220,38,38,0.2)' };
    case 'REFUNDED':         return { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.2)' };
    case 'ACTIVE':           return { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', border: 'rgba(34,197,94,0.2)' };
    case 'INACTIVE':         return { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.2)' };
    default:                 return { bg: 'rgba(15,42,91,0.06)', color: '#0F2A5B', border: 'rgba(15,42,91,0.12)' };
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case 'PENDING':  return { bg: 'rgba(166,128,38,0.08)', color: '#A68026', border: 'rgba(166,128,38,0.2)' };
    case 'PAID':     return { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', border: 'rgba(34,197,94,0.2)' };
    case 'FAILED':   return { bg: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'rgba(220,38,38,0.2)' };
    case 'REFUNDED': return { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.2)' };
    default:         return { bg: 'rgba(15,42,91,0.06)', color: '#0F2A5B', border: 'rgba(15,42,91,0.12)' };
  }
}

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'payment';
}

export default function StatusBadge({ status, type = 'order' }: StatusBadgeProps) {
  const colors = type === 'payment' ? getPaymentStatusColor(status) : getOrderStatusColor(status);
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '100px',
      fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em',
      fontFamily: 'var(--font-body)',
      background: colors.bg, color: colors.color,
      border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>
      {status}
    </span>
  );
}
