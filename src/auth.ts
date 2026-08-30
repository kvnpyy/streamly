import { getDb } from "@/db";
import { users } from "@/db/schema";
import { EmailNotVerified } from "@/lib/auth-credentials-error";
import type { DefaultSession } from "next-auth";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
  }
}

function resolveAuthSecret(): string {
  const raw = process.env.AUTH_SECRET?.trim();
  if (raw && raw.length >= 16) return raw;
  if (process.env.NODE_ENV !== "production") {
    return "iptv-stream-local-auth-secret-dev-only-min-length!!!";
  }
  /* Production builds (`next build`) often run without secrets in CI — set AUTH_SECRET on the host. */
  return "iptv-stream-production-missing-auth-secret-replace-me!!!";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolveAuthSecret(),
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 90,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const emailRaw = credentials?.email;
        const passwordRaw = credentials?.password;
        if (
          emailRaw == null ||
          passwordRaw == null ||
          typeof emailRaw !== "string" ||
          typeof passwordRaw !== "string"
        ) {
          return null;
        }
        const email = emailRaw.trim().toLowerCase();
        if (!email || passwordRaw.length === 0) return null;

        const rows = await getDb()
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            passwordHash: users.passwordHash,
            emailVerifiedAt: users.emailVerifiedAt,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const row = rows[0];
        const hash = row?.passwordHash;
        if (!row || !hash) return null;

        const ok = await bcrypt.compare(passwordRaw, hash);
        if (!ok) return null;

        if (row.emailVerifiedAt == null) {
          throw new EmailNotVerified();
        }

        return {
          id: row.id,
          email: row.email,
          name: row.name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        return token;
      }
      const sub = token.sub;
      if (typeof sub !== "string") return token;
      const rows = await getDb()
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, sub))
        .limit(1);
      const row = rows[0];
      if (!row) {
        delete token.sub;
        delete token.name;
        delete token.email;
        return token;
      }
      token.name = row.name ?? undefined;
      token.email = row.email;
      return token;
    },
    session({ session, token }) {
      const sub = token.sub;
      if (session.user && typeof sub === "string") {
        session.user.id = sub;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.email === "string") session.user.email = token.email;
      } else if (session.user) {
        delete (session.user as { id?: string }).id;
      }
      return session;
    },
  },
});
