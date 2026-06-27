import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/db/index";
import { users, otps } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

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

        // Find the most recent OTP for this email + code
        const [otpRecord] = await db
          .select()
          .from(otps)
          .where(and(eq(otps.email, email), eq(otps.code, otp)))
          .orderBy(desc(otps.createdAt))
          .limit(1);

        if (!otpRecord) return null;

        if (otpRecord.expiresAt < new Date()) {
          await db.delete(otps).where(eq(otps.id, otpRecord.id));
          return null;
        }

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
