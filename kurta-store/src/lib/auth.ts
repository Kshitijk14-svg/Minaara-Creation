import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db as prisma } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        otp: { label: "OTP", type: "text" },
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const otp = (credentials.otp as string).trim();
        const name = credentials.name as string | undefined;

        // Find the most recent OTP record for this email + code combo
        const otpRecord = await prisma.otp.findFirst({
          where: { email, code: otp },
          orderBy: { createdAt: 'desc' }
        });

        if (!otpRecord) {
          // Return null — NextAuth will surface "CredentialsSignin", handled on frontend
          return null;
        }

        if (otpRecord.expiresAt < new Date()) {
          // Delete expired record to keep DB clean, then reject
          await prisma.otp.delete({ where: { id: otpRecord.id } });
          return null;
        }

        // upsert is idempotent: concurrent logins for the same new email won't race
        // on user creation (MySQL translates upsert to INSERT ... ON DUPLICATE KEY UPDATE)
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, name: name?.trim() || null, role: 'CUSTOMER' },
        });

        await prisma.otp.delete({ where: { id: otpRecord.id } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // @ts-ignore — role is not on default NextAuth User type
          role: user.role,
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
})

