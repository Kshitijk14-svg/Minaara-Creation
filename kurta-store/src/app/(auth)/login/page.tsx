'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  fontWeight: 600,
  color: 'var(--color-brand-charcoal)',
  opacity: 0.7,
  marginBottom: '8px',
  fontFamily: 'var(--font-body)',
};

const inputStyle: React.CSSProperties = {
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
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
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
  opacity: disabled ? 0.5 : 1,
  transition: 'background-color 0.3s',
});

const linkButtonStyle: React.CSSProperties = {
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
  textAlign: 'center',
};

type Mode = 'SIGNIN' | 'SIGNUP' | 'FORGOT';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<Mode>('SIGNIN');
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const verifyInFlightRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const resetExtraFields = () => {
    setOtp('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setStep('EMAIL');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetExtraFields();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await signIn('password', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        throw new Error('Incorrect email or password.');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Shared by the initial send and the OTP-step resend button — throws on failure.
  const requestOtp = async () => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        type: mode === 'SIGNUP' ? 'SIGNUP' : 'RESET',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
  };

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
      await requestOtp();
      setStep('OTP');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Lets a user get a fresh code without discarding the email/name step —
  // "Back to email" alone made it too easy to keep verifying a stale/already
  // -consumed code instead of just asking for a new one.
  const handleResendOtp = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setError('');
    try {
      await requestOtp();
      setOtp('');
      setResendCooldown(20);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guards against a fast double-click/double-tap firing two verify
    // requests for the same one-time code — the second would always find
    // the code already consumed and report it as "incorrect or expired"
    // even though it was correct. Checked synchronously (unlike the
    // `loading` state, which only disables the button after a render).
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setLoading(true);
    setError('');

    if (mode === 'FORGOT' || mode === 'SIGNUP') {
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        setLoading(false);
        verifyInFlightRef.current = false;
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        setLoading(false);
        verifyInFlightRef.current = false;
        return;
      }
    }

    try {
      // NextAuth's signIn() serializes these via `new URLSearchParams(...)`,
      // which stringifies `undefined` to the literal text "undefined" rather
      // than omitting the field — so `name`/`newPassword` must be left out
      // of the object entirely when not applicable, not set to `undefined`,
      // or authorize() would see a truthy "undefined" string and branch on
      // it as if a real password/name were provided.
      const res = await signIn('otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        mode,
        ...(mode === 'SIGNUP' ? { name: name.trim() } : {}),
        newPassword,
        redirect: false,
      });

      if (res?.error) {
        if ((res as any)?.code === 'otp_locked') {
          throw new Error('Too many incorrect attempts. Please wait 15 minutes or request a new code.');
        }
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
      verifyInFlightRef.current = false;
    }
  };

  const heading = mode === 'FORGOT'
    ? (step === 'EMAIL' ? 'Reset Password' : 'Set New Password')
    : step === 'EMAIL'
      ? (mode === 'SIGNIN' ? 'Welcome Back' : 'Create Account')
      : 'Verify Access';

  const subheading = mode === 'FORGOT'
    ? (step === 'EMAIL' ? "Enter your account email and we'll send you a code." : `Enter the code sent to ${email} and choose a new password.`)
    : step === 'EMAIL'
      ? (mode === 'SIGNIN' ? 'Enter your credentials to access your account.' : 'Join the collective for curated artisan collections.')
      : mode === 'SIGNUP'
        ? `Enter the code sent to ${email} and create a password.`
        : `We've sent a 6-digit code to ${email}`;

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
                Minara
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
              {heading}
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
              {subheading}
            </p>
          </div>

          {/* Toggle Tabs (Sign In / Sign Up) - hidden during OTP step and during password reset */}
          {step === 'EMAIL' && mode !== 'FORGOT' && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-brand-smoke)', marginBottom: '28px' }}>
              <button
                type="button"
                onClick={() => switchMode('SIGNIN')}
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
                onClick={() => switchMode('SIGNUP')}
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

          {mode === 'SIGNIN' ? (
            <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleSignIn}>
              <div>
                <label htmlFor="email" style={labelStyle}>Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" style={labelStyle}>Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="btn-liquid"
                style={{ ...primaryButtonStyle(loading || !email.trim() || !password), marginTop: '8px' }}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={() => switchMode('FORGOT')}
                style={linkButtonStyle}
              >
                Forgot password?
              </button>
              <p style={{ margin: '-8px 0 0', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, lineHeight: 1.4 }}>
                First time signing in with a password? Use &ldquo;Forgot password?&rdquo; to set one.
              </p>
            </form>
          ) : step === 'EMAIL' ? (
            <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleSendOtp}>
              {mode === 'SIGNUP' && (
                <div>
                  <label htmlFor="name" style={labelStyle}>Full Name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={inputStyle}
                    placeholder="Enter your full name"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" style={labelStyle}>Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter your email"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || (mode === 'SIGNUP' && !name.trim())}
                className="btn-liquid"
                style={{ ...primaryButtonStyle(loading || !email.trim() || (mode === 'SIGNUP' && !name.trim())), marginTop: '8px' }}
              >
                {loading ? 'Sending Code...' : 'Continue'}
              </button>

              {mode === 'FORGOT' && (
                <button type="button" onClick={() => switchMode('SIGNIN')} style={linkButtonStyle}>
                  Back to sign in
                </button>
              )}
            </form>
          ) : (
            <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleVerifyOtp}>
              <div>
                <label htmlFor="otp" style={labelStyle}>Verification Code</label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  style={{
                    ...inputStyle,
                    fontSize: '20px',
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'center',
                    letterSpacing: '0.4em',
                  }}
                  placeholder="------"
                  maxLength={6}
                />
              </div>

              {(mode === 'FORGOT' || mode === 'SIGNUP') && (
                <>
                  <div>
                    <label htmlFor="newPassword" style={labelStyle}>{mode === 'SIGNUP' ? 'Password' : 'New Password'}</label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={inputStyle}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" style={labelStyle}>Confirm Password</label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={inputStyle}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={loading || otp.length < 6 || ((mode === 'FORGOT' || mode === 'SIGNUP') && (!newPassword || !confirmPassword))}
                  className="btn-liquid"
                  style={primaryButtonStyle(loading || otp.length < 6 || ((mode === 'FORGOT' || mode === 'SIGNUP') && (!newPassword || !confirmPassword)))}
                >
                  {loading
                    ? (mode === 'FORGOT' ? 'Updating...' : 'Verifying...')
                    : (mode === 'SIGNUP' ? 'Confirm Registration' : 'Set New Password')}
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resending || resendCooldown > 0}
                  style={{ ...linkButtonStyle, opacity: (resending || resendCooldown > 0) ? 0.4 : 0.5 }}
                >
                  {resending
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend code (${resendCooldown}s)`
                      : 'Resend code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('EMAIL');
                    setOtp('');
                    setError('');
                  }}
                  style={linkButtonStyle}
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
