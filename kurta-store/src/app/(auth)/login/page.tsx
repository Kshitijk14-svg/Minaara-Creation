'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [mode, setMode] = useState<'SIGNIN' | 'SIGNUP'>('SIGNIN');
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'SIGNUP' && !name.trim()) {
      setError('Please enter your full name to sign up.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), type: mode }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      setStep('OTP');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        name: mode === 'SIGNUP' ? name.trim() : undefined,
        redirect: false,
      });

      if (res?.error) {
        // NextAuth wraps authorize() errors as generic "CredentialsSignin"
        // Map to user-friendly messages based on context
        const errorMap: Record<string, string> = {
          CredentialsSignin: otp.trim().length === 6
            ? 'The code you entered is incorrect or has expired. Please try again.'
            : 'Invalid verification code. Please enter all 6 digits.',
          OAuthAccountNotLinked: 'This email is already used with a different sign-in method.',
        };
        throw new Error(errorMap[res.error] ?? 'Verification failed. Please try again.');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '60px', paddingBottom: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '440px', padding: '0 20px' }}>
        
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: '24px' }}>
          <Link 
            href="/" 
            className="text-[10px] uppercase tracking-[0.2em] font-semibold transition-colors font-body flex items-center gap-3 group"
            style={{ textDecoration: 'none', display: 'inline-flex', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}
          >
            <span className="w-4 h-px group-hover:w-8 transition-all duration-300" style={{ backgroundColor: 'var(--color-brand-charcoal)', opacity: 0.3 }}></span>
            Return to Store
          </Link>
        </div>

        <div 
          style={{ 
            backgroundColor: 'var(--glass-bg)', 
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '16px', 
            border: '1px solid var(--glass-border)', 
            padding: '40px 32px',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          {/* Logo / Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.75rem', fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', color: 'var(--color-brand-charcoal)', letterSpacing: '0.05em' }}>
                Minaara
              </span>
            </Link>
            <h2 
              style={{ 
                fontFamily: 'var(--font-display)', 
                fontSize: '1.5rem', 
                fontWeight: 400, 
                color: 'var(--color-brand-charcoal)',
                margin: '0 0 8px'
              }}
            >
              {step === 'EMAIL' ? (mode === 'SIGNIN' ? 'Welcome Back' : 'Create Account') : 'Verify Access'}
            </h2>
            <p 
              style={{ 
                fontFamily: 'var(--font-body)', 
                fontSize: '13px', 
                color: 'var(--color-brand-charcoal)',
                opacity: 0.6,
                margin: 0,
                lineHeight: 1.4
              }}
            >
              {step === 'EMAIL'
                ? (mode === 'SIGNIN' ? 'Enter your credentials to access your account.' : 'Join the collective for curated artisan collections.')
                : `We've sent a 6-digit code to ${email}`}
            </p>
          </div>

          {/* Toggle Tabs (Sign In / Sign Up) - Hidden/Disabled during OTP verification */}
          {step === 'EMAIL' && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-brand-smoke)', marginBottom: '28px' }}>
              <button
                type="button"
                onClick={() => {
                  setMode('SIGNIN');
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: '12px 6px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: mode === 'SIGNIN' ? '2px solid var(--color-brand-charcoal)' : '2px solid transparent',
                  color: 'var(--color-brand-charcoal)',
                  opacity: mode === 'SIGNIN' ? 1 : 0.4,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('SIGNUP');
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: '12px 6px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: mode === 'SIGNUP' ? '2px solid var(--color-brand-charcoal)' : '2px solid transparent',
                  color: 'var(--color-brand-charcoal)',
                  opacity: mode === 'SIGNUP' ? 1 : 0.4,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Sign Up
              </button>
            </div>
          )}

          {error && (
            <div 
              style={{ 
                padding: '12px 14px', 
                border: '1px solid rgba(128, 0, 0, 0.15)', 
                backgroundColor: 'rgba(128, 0, 0, 0.05)', 
                color: '#800000', 
                fontSize: '12px', 
                fontFamily: 'var(--font-body)',
                borderRadius: '4px',
                marginBottom: '24px',
                lineHeight: 1.4
              }}
            >
              {error}
            </div>
          )}

          {step === 'EMAIL' ? (
            <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleSendOtp}>
              {mode === 'SIGNUP' && (
                <div>
                  <label 
                    htmlFor="name" 
                    style={{ 
                      display: 'block', 
                      fontSize: '10px', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.2em', 
                      fontWeight: 600, 
                      color: 'var(--color-brand-charcoal)',
                      opacity: 0.7,
                      marginBottom: '8px',
                      fontFamily: 'var(--font-body)'
                    }}
                  >
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '4px',
                      border: '1px solid var(--glass-border)',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      color: 'var(--color-brand-charcoal)',
                      fontSize: '13px',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    placeholder="Enter your full name"
                  />
                </div>
              )}

              <div>
                <label 
                  htmlFor="email" 
                  style={{ 
                    display: 'block', 
                    fontSize: '10px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.2em', 
                    fontWeight: 600, 
                    color: 'var(--color-brand-charcoal)',
                    opacity: 0.7,
                    marginBottom: '8px',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--glass-border)',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: 'var(--color-brand-charcoal)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-body)',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  placeholder="Enter your email"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || (mode === 'SIGNUP' && !name.trim())}
                className="btn-liquid"
                style={{
                  width: '100%',
                  padding: '16px 24px',
                  backgroundColor: 'var(--color-brand-charcoal)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  cursor: 'pointer',
                  opacity: (loading || !email.trim() || (mode === 'SIGNUP' && !name.trim())) ? 0.5 : 1,
                  transition: 'background-color 0.3s',
                  marginTop: '8px'
                }}
              >
                {loading ? 'Sending Code...' : 'Continue'}
              </button>
            </form>
          ) : (
            <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleVerifyOtp}>
              <div>
                <label 
                  htmlFor="otp" 
                  style={{ 
                    display: 'block', 
                    fontSize: '10px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.2em', 
                    fontWeight: 600, 
                    color: 'var(--color-brand-charcoal)',
                    opacity: 0.7,
                    marginBottom: '8px',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Verification Code
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--glass-border)',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: 'var(--color-brand-charcoal)',
                    fontSize: '20px',
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'center',
                    letterSpacing: '0.4em',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  placeholder="------"
                  maxLength={6}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="btn-liquid"
                  style={{
                    width: '100%',
                    padding: '16px 24px',
                    backgroundColor: 'var(--color-brand-charcoal)',
                    color: '#ffffff',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    opacity: (loading || otp.length < 6) ? 0.5 : 1,
                    transition: 'background-color 0.3s'
                  }}
                >
                  {loading ? 'Verifying...' : (mode === 'SIGNIN' ? 'Confirm Sign In' : 'Confirm Registration')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('EMAIL');
                    setOtp('');
                    setError('');
                  }}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--color-brand-charcoal)',
                    opacity: 0.5,
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: '8px 0',
                    textAlign: 'center'
                  }}
                >
                  Back to email
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: '28px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, letterSpacing: '0.05em', lineHeight: 1.5 }}>
              By continuing, you agree to our Terms of Service & Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
