'use client';

import React, { useCallback, useEffect, useState } from 'react';
import LoadingSkeleton from './shared/LoadingSkeleton';
import AdminTable from './shared/AdminTable';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';

interface UserRow {
  id: string; email: string; name: string | null; role: Role; createdAt: string;
}

const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 4, ADMIN: 3, STAFF: 2, CUSTOMER: 1,
};

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', STAFF: 'Staff', CUSTOMER: 'Customer',
};

const ROLE_COLORS: Record<Role, { bg: string; color: string; border: string }> = {
  SUPER_ADMIN: { bg: 'rgba(34,197,94,0.08)',   color: '#16a34a', border: 'rgba(34,197,94,0.2)' },
  ADMIN:       { bg: 'rgba(50,81,140,0.08)',   color: '#32518C', border: 'rgba(50,81,140,0.2)' },
  STAFF:       { bg: 'rgba(79,70,229,0.08)',   color: '#4f46e5', border: 'rgba(79,70,229,0.2)' },
  CUSTOMER:    { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.2)' },
};

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  return email[0].toUpperCase();
}

interface Props { callerRole: Role; }

export default function UsersTab({ callerRole }: Props) {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [saving, setSaving]         = useState<string | null>(null);
  const [error, setError]           = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)     params.set('email', search);
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateRole = async (userId: string, role: Role) => {
    setSaving(userId); setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to update role'); return; }
      setUsers((us) => us.map((u) => u.id === userId ? { ...u, role } : u));
    } finally {
      setSaving(null);
    }
  };

  const callerRank = ROLE_RANK[callerRole];

  const assignableRoles = (Object.keys(ROLE_RANK) as Role[])
    .filter((r) => ROLE_RANK[r] <= callerRank && (callerRole === 'SUPER_ADMIN' || ROLE_RANK[r] < ROLE_RANK['ADMIN']));

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
          Users
        </h2>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', outline: 'none', minWidth: '220px' }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | '')}
          style={{ padding: '9px 32px 9px 14px', borderRadius: '6px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', cursor: 'pointer', outline: 'none', appearance: 'none' }}
        >
          <option value="">All Roles</option>
          {(Object.keys(ROLE_RANK) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <button
          onClick={() => { setSearch(''); setRoleFilter(''); }}
          style={{ padding: '9px 16px', borderRadius: '6px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', cursor: 'pointer', opacity: 0.6 }}
        >
          Clear
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '6px', backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', fontFamily: 'var(--font-body)', fontSize: '13px', color: '#C0392B' }}>
          {error}
        </div>
      )}

      {loading ? <LoadingSkeleton rows={6} /> : (
        <AdminTable
          headers={['User', 'Role', 'Joined', 'Change Role']}
          isEmpty={users.length === 0}
          empty={<p style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>No users found.</p>}
        >
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--color-brand-mist)' }}>

              {/* Avatar + email */}
              <td style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--color-brand-mauve) 0%, var(--color-brand-mauve-deep) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontSize: '13px', color: '#fff', fontWeight: 500,
                  }}>
                    {getInitials(u.name, u.email)}
                  </div>
                  <div>
                    {u.name && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: 0 }}>
                        {u.name}
                      </p>
                    )}
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: u.name ? '2px 0 0' : 0 }}>
                      {u.email}
                    </p>
                  </div>
                </div>
              </td>

              {/* Role badge */}
              <td style={{ padding: '14px 16px' }}>
                <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-body)', display: 'inline-block', whiteSpace: 'nowrap', ...ROLE_COLORS[u.role] }}>
                  {ROLE_LABELS[u.role]}
                </span>
              </td>

              {/* Join date */}
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
                {fmtDate(u.createdAt)}
              </td>

              {/* Role selector */}
              <td style={{ padding: '14px 16px' }}>
                {saving === u.id ? (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>Saving…</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value as Role)}
                    disabled={ROLE_RANK[u.role] > callerRank}
                    style={{
                      padding: '6px 28px 6px 10px', borderRadius: '6px',
                      border: '1px solid var(--color-brand-mist)',
                      backgroundColor: ROLE_RANK[u.role] > callerRank ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.8)',
                      fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)',
                      cursor: ROLE_RANK[u.role] > callerRank ? 'not-allowed' : 'pointer',
                      outline: 'none', appearance: 'none', opacity: ROLE_RANK[u.role] > callerRank ? 0.4 : 1,
                    }}
                  >
                    {assignableRoles.includes(u.role) ? (
                      assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)
                    ) : (
                      <option value={u.role}>{ROLE_LABELS[u.role]}</option>
                    )}
                  </select>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
