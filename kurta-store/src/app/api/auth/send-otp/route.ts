import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { db } from '@/db/index';
import { users, otps } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { redis } from '@/lib/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'otp_rl',
});

export async function POST(req: NextRequest) {
  try {
    const { email, type } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    if (!type || (type !== 'SIGNIN' && type !== 'SIGNUP')) {
      return NextResponse.json({ error: 'Valid request type (SIGNIN or SIGNUP) is required' }, { status: 400 });
    }

    const { success, reset } = await ratelimit.limit(email.toLowerCase());
    if (!success) {
      const retryAfterSecs = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Too many OTP requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
      );
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (type === 'SIGNIN' && !existingUser) {
      return NextResponse.json(
        { error: 'Account does not exist. Please sign up instead.' },
        { status: 400 }
      );
    }

    if (type === 'SIGNUP' && existingUser) {
      return NextResponse.json(
        { error: 'An account already exists with this email. Please sign in instead.' },
        { status: 400 }
      );
    }

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.insert(otps).values({ email, code, expiresAt });

    const subject = type === 'SIGNUP' ? 'Verify your Minaara account' : 'Your Minaara sign-in code';
    const html    = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;border:1px solid #ede9df;border-radius:12px;background:#faf8f5;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:24px;font-family:Georgia,serif;font-style:italic;color:#0f2a5b;letter-spacing:0.05em;">Minaara</span>
      </div>
      <h2 style="font-family:Georgia,serif;font-weight:normal;color:#0f2a5b;text-align:center;margin-bottom:16px;">
        ${type === 'SIGNUP' ? 'Create Your Account' : 'Welcome Back'}
      </h2>
      <p style="color:#4a4a4a;font-size:14px;line-height:1.6;text-align:center;margin-bottom:24px;">
        Your one-time verification code:
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <div style="letter-spacing:6px;font-family:monospace;font-size:32px;color:#0f2a5b;background:rgba(166,128,38,0.08);padding:16px 24px;border:1px dashed #a68026;border-radius:8px;display:inline-block;">${code}</div>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin:0;">
        Valid for 5 minutes. If you didn't request this, you can ignore this email.
      </p>
    </div>`;

    try {
      await sendEmail({ to: email, subject, html });
    } catch (mailErr: any) {
      console.error('Mail send error:', mailErr);
      return NextResponse.json(
        { error: `Email delivery failed: ${mailErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error('send-otp route error:', error);
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
