import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

/**
 * NextAuth.js configuration for MatLit Miner.
 *
 * - Uses JWT session strategy (stateless, works well with App Router).
 * - Credentials provider validates email + password against the SQLite
 *   User table (passwords stored as bcrypt hashes).
 * - On successful sign-in we expose `id`, `email`, and `name` on the JWT
 *   and session so the client header can render the user menu.
 */
export const authOptions: NextAuthOptions = {
  // Explicit secret — NextAuth refuses to sign JWTs / cookies without it
  // (and prints a noisy [NO_SECRET] warning on every request). We fall
  // back to a hard-coded dev value so the app still runs if the env var
  // is missing locally; production MUST set NEXTAUTH_SECRET.
  secret:
    process.env.NEXTAUTH_SECRET ||
    'dev-secret-change-in-production-please',
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password ?? ""
        if (!email || !password) return null

        const user = await db.user.findUnique({
          where: { email },
        })
        if (!user) return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        }
      },
    }),
  ],
  // JWT sessions are stateless and work well with the App Router.
  // Bump maxAge to 30 days so clients don't have to re-validate against
  // /api/auth/session constantly (cuts a lot of background polling).
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days — keep tokens alive as long as sessions
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email ?? token.email
        if (user.name) token.name = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // Surface the user id + email on the session object.
        ;(session.user as { id?: string }).id = token.id as string | undefined
        session.user.email = token.email as string | undefined | null
        if (token.name) session.user.name = token.name as string
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
