import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/db/index";
import { users, otps } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";

// Lock verification for an email after too many failed codes (brute-force guard).
const MAX_OTP_ATTEMPTS = 5;
const OTP_FAIL_WINDOW_SECS = 15 * 60;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        otp:   { label: "OTP", type: "text" },
        name:  { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const otp   = (credentials.otp as string).trim();
        const name  = credentials.name as string | undefined;

        const failKey = `otp_fail:${email}`;

        // Reject early if this email is locked out from too many bad attempts.
        try {
          const fails = await redis.get<number>(failKey);
          if (typeof fails === 'number' && fails >= MAX_OTP_ATTEMPTS) return null;
        } catch {
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

        // Load the single most-recent code for this email (send-otp keeps one).
        const [otpRecord] = await db
          .select()
          .from(otps)
          .where(eq(otps.email, email))
          .orderBy(desc(otps.createdAt))
          .limit(1);

        if (!otpRecord || otpRecord.expiresAt < new Date()) {
          if (otpRecord) await db.delete(otps).where(eq(otps.id, otpRecord.id));
          await registerFailure();
          return null;
        }

        // Constant-time code comparison.
        const stored = Buffer.from(otpRecord.code);
        const given  = Buffer.from(otp);
        const codeMatches = stored.length === given.length && timingSafeEqual(stored, given);
        if (!codeMatches) {
          await registerFailure();
          return null;
        }

        // Success — clear the failure counter and consume the code.
        try { await redis.del(failKey); } catch { /* non-fatal */ }

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

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        await db.delete(otps).where(eq(otps.id, otpRecord.id));

        if (!user) return null;

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
