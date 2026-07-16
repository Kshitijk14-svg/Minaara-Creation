import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/db/index";
import { users, otps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";
import { hashPassword, verifyPassword } from "@/lib/password";
import { maskEmail } from "@/lib/mask-email";

// Lock verification for an email after too many failed codes (brute-force guard).
const MAX_OTP_ATTEMPTS = 5;
const OTP_FAIL_WINDOW_SECS = 15 * 60;

// Thrown instead of returning false so the frontend can tell "locked out"
// apart from "wrong/expired code" (both would otherwise show the same
// generic CredentialsSignin error). `code` surfaces via signIn()'s result.
class OtpLocked extends CredentialsSignin {
  code = "otp_locked";
}

// Shared by the OTP provider for both signup and password-reset verification.
// Checks the lockout counter, loads the (unique) code row for the email, and
// does a constant-time compare. Always consumes (deletes) a matched or
// expired code. Returns whether the code was valid.
async function verifyOtpCode(email: string, otp: string): Promise<boolean> {
  const failKey = `otp_fail:${email}`;

  try {
    const fails = await redis.get<number>(failKey);
    if (typeof fails === 'number' && fails >= MAX_OTP_ATTEMPTS) {
      console.log(`[otp] locked email=${maskEmail(email)} fails=${fails}`);
      throw new OtpLocked();
    }
  } catch (e) {
    if (e instanceof OtpLocked) throw e;
    // Redis unavailable — the DB checks below still apply.
  }

  const registerFailure = async () => {
    try {
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, OTP_FAIL_WINDOW_SECS);
    } catch {
      // non-fatal
    }
  };

  const [otpRecord] = await db
    .select()
    .from(otps)
    .where(eq(otps.email, email))
    .limit(1);

  if (!otpRecord || otpRecord.expiresAt < new Date()) {
    // Diagnostic only — never logs the code itself. Distinguishes "no row
    // at all" (e.g. already consumed by an earlier successful verify) from
    // a genuine expiry, since both currently surface the same generic
    // "incorrect or expired" message to the user.
    console.log(otpRecord
      ? `[otp] expired email=${maskEmail(email)} expiresAt=${otpRecord.expiresAt.toISOString()} now=${new Date().toISOString()}`
      : `[otp] no-row email=${maskEmail(email)}`);
    if (otpRecord) await db.delete(otps).where(eq(otps.id, otpRecord.id));
    await registerFailure();
    return false;
  }

  const stored = Buffer.from(otpRecord.code);
  const given  = Buffer.from(otp);
  const codeMatches = stored.length === given.length && timingSafeEqual(stored, given);

  if (!codeMatches) {
    console.log(`[otp] mismatch email=${maskEmail(email)} storedLen=${stored.length} givenLen=${given.length}`);
    await registerFailure();
    return false;
  }

  try { await redis.del(failKey); } catch { /* non-fatal */ }
  await db.delete(otps).where(eq(otps.id, otpRecord.id));
  return true;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    // Signup + forgot-password: verifies an emailed 6-digit code. With no
    // `newPassword`, it's a signup (creates the account if missing). With
    // `newPassword`, it's a password reset/first-time-set for an existing
    // account (send-otp's RESET type already guarantees the account exists).
    CredentialsProvider({
      id: "otp",
      name: "OTP",
      credentials: {
        email:       { label: "Email", type: "email" },
        otp:         { label: "OTP", type: "text" },
        name:        { label: "Name", type: "text" },
        newPassword: { label: "New Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;

        const email       = (credentials.email as string).trim().toLowerCase();
        const otp         = (credentials.otp as string).trim();
        const name        = credentials.name as string | undefined;
        const newPassword = credentials.newPassword as string | undefined;

        const valid = await verifyOtpCode(email, otp);
        if (!valid) return null;

        if (newPassword) {
          const passwordHash = await hashPassword(newPassword);
          await db.update(users).set({ passwordHash }).where(eq(users.email, email));
        } else {
          // Upsert user: insert if not exists, no-op on duplicate
          await db
            .insert(users)
            .values({
              id:    randomUUID(),
              email,
              name:  name?.trim() || null,
              role:  'CUSTOMER',
            })
            .onDuplicateKeyUpdate({ set: { email } }); // no-op update — keeps existing data
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) return null;

        return {
          id:   user.id,
          email: user.email,
          name:  user.name,
          // @ts-ignore — role is not on default NextAuth User type
          role:  user.role,
        };
      }
    }),
    // Login: email + password. Always runs verifyPassword (even for a
    // missing user or missing hash) so response timing doesn't reveal
    // whether the account exists or has a password set yet.
    CredentialsProvider({
      id: "password",
      name: "Password",
      credentials: {
        email:    { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email    = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const ok = await verifyPassword(password, user?.passwordHash ?? null);
        if (!ok || !user) return null;

        return {
          id:   user.id,
          email: user.email,
          name:  user.name,
          // @ts-ignore — role is not on default NextAuth User type
          role:  user.role,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // @ts-ignore
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.role = token.role;
        session.user.name = token.name as string;
      }
      return session;
    }
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: '/login',
  }
});
