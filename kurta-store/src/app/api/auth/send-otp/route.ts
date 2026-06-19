import { NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email, type } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    if (!type || (type !== 'SIGNIN' && type !== 'SIGNUP')) {
      return NextResponse.json({ error: "Valid request type (SIGNIN or SIGNUP) is required" }, { status: 400 });
    }

    // Check account existence based on flow type
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (type === 'SIGNIN' && !existingUser) {
      return NextResponse.json(
        { error: "Account does not exist. Please sign up instead." },
        { status: 400 }
      );
    }

    if (type === 'SIGNUP' && existingUser) {
      return NextResponse.json(
        { error: "An account already exists with this email. Please sign in instead." },
        { status: 400 }
      );
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save to DB
    await prisma.otp.create({
      data: { email, code, expiresAt }
    });

    // ─── Email Transport Setup ───────────────────────────────────────────────
    const gmailUser = process.env.EMAIL_USER;
    const gmailPass = process.env.EMAIL_PASS;
    const smtpHost  = process.env.SMTP_HOST;
    const smtpPort  = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
    const smtpSecure = process.env.SMTP_SECURE === 'true';
    const smtpUser  = process.env.SMTP_USER;
    const smtpPass  = process.env.SMTP_PASS;

    let transporter: nodemailer.Transporter | null = null;
    // The 'from' must match the authenticated sender — Gmail rejects mismatched from addresses
    let fromAddress: string;

    if (smtpHost && smtpUser && smtpPass) {
      // Generic SMTP (Brevo, Hostinger, Zoho, SendGrid, etc.)
      fromAddress = process.env.SMTP_FROM || `"Minaara Store" <${smtpUser}>`;
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      });
    } else if (gmailUser && gmailPass) {
      // Gmail with App Password — from must be the Gmail address
      fromAddress = `"Minaara Store" <${gmailUser}>`;
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
        tls: { rejectUnauthorized: false },
      });
    } else {
      fromAddress = '"Minaara Store" <no-reply@minaara.com>';
    }

    const mailOptions = {
      from: fromAddress,
      to: email,
      subject: type === 'SIGNUP'
        ? 'Verify your Minaara account'
        : 'Your Minaara sign-in code',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;border:1px solid #ede9df;border-radius:12px;background:#faf8f5;">
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
      </div>`,
    };

    if (transporter) {
      try {
        await transporter.sendMail(mailOptions);
      } catch (mailErr: any) {
        console.error('Mail send error:', mailErr);
        return NextResponse.json(
          { error: `Email delivery failed: ${mailErr.message}` },
          { status: 500 }
        );
      }
    } else {
      // No email config — print to terminal (dev fallback)
      console.log('\n======= DEV MODE OTP =======');
      console.log(`  Type  : ${type}`);
      console.log(`  Email : ${email}`);
      console.log(`  Code  : ${code}`);
      console.log('============================\n');
    }

    return NextResponse.json({ success: true, message: "OTP sent successfully" });

  } catch (error: any) {
    console.error('send-otp route error:', error);
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
