'use client';

import React from 'react';

interface AdminTableProps {
  headers: string[];
  children: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: boolean;
}

export default function AdminTable({ headers, children, empty, isEmpty }: AdminTableProps) {
  return (
    <div style={{
      background: 'var(--admin-card-bg)',
      border: '1px solid var(--admin-card-border)',
      borderRadius: '12px',
      boxShadow: 'var(--admin-card-shadow)',
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'rgba(15,42,91,0.04)', borderBottom: '1px solid var(--color-brand-mist)' }}>
              {headers.map((h) => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left',
                  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.18em',
                  color: 'var(--color-brand-charcoal)', opacity: 0.5,
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={headers.length} style={{ padding: '48px 24px', textAlign: 'center' }}>
                  {empty || (
                    <p style={{
                      fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontStyle: 'italic',
                      color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: 0,
                    }}>
                      Nothing here yet
                    </p>
                  )}
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, mono, right, style }: {
  children: React.ReactNode;
  mono?: boolean;
  right?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--color-brand-mist)',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
      fontSize: mono ? '11px' : '13px',
      color: 'var(--color-brand-charcoal)',
      textAlign: right ? 'right' : 'left',
      verticalAlign: 'middle',
      ...style,
    }}>
      {children}
    </td>
  );
}
