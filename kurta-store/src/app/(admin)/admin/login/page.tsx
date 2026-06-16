'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [secretKey, setSecretKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Verify the secret key via the design config API (Bearer auth)
      const res = await fetch('/api/config/design', {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      });

      // We do a test PATCH with empty body to verify admin auth
      const verifyRes = await fetch('/api/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        // Send intentionally invalid body — if we get 400 (not 401), auth passed
        body: JSON.stringify({}),
      });

      const isAuthorized = verifyRes.status !== 401;

      if (isAuthorized) {
        sessionStorage.setItem('admin_token', secretKey);
        router.push('/admin/design-mgr');
      } else {
        setError('Invalid secret key. Access denied.');
      }
    } catch {
      setError('Failed to verify credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div
          className="rounded-2xl p-8"
          style={{ backgroundColor: 'var(--color-brand-ivory)' }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: 'var(--color-brand-mauve)' }}
            >
              Admin Portal
            </p>
            <h1
              className="text-3xl"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-brand-charcoal)',
                fontWeight: 300,
              }}
            >
              Minaara Creation
            </h1>
          </div>

          <div className="section-divider is-visible mb-8" />

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-secret-key"
                className="block text-xs uppercase tracking-widest mb-2"
                style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}
              >
                Secret Key
              </label>
              <input
                id="admin-secret-key"
                type="password"
                placeholder="Enter admin secret key"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-md border text-sm focus:outline-none"
                style={{
                  borderColor: 'var(--color-brand-mauve)',
                  backgroundColor: 'var(--color-brand-blush)',
                  color: 'var(--color-brand-charcoal)',
                  fontFamily: 'var(--font-body)',
                }}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-xs" style={{ color: '#C0392B' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !secretKey.trim()}
              className="w-full py-3 text-sm uppercase tracking-widest rounded-md transition-all duration-300 disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-brand-mauve)', color: 'white' }}
              id="admin-login-btn"
            >
              {isLoading ? 'Verifying…' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
