import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { APP_NAME } from "@/config/app";
import { appUrl, isEmailAllowed, requireEnv } from "@/config/env";
import { getDb } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";

/**
 * The error the sign-in hooks throw for an email that isn't allowed. It needs
 * a `code`: Better Auth's OAuth callback only redirects back to the sign-in
 * page (with ?error=NOT_ALLOWED) for errors that have one.
 */
export function notAllowedError(): APIError {
  return new APIError("FORBIDDEN", {
    code: "NOT_ALLOWED",
    message: "This Google account is not allowed to sign in.",
  });
}

function createAuth() {
  const db = getDb();
  return betterAuth({
    appName: APP_NAME,
    baseURL: appUrl(),
    secret: requireEnv("BETTER_AUTH_SECRET"),
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    socialProviders: {
      google: {
        clientId: requireEnv("GOOGLE_CLIENT_ID"),
        clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
        prompt: "select_account",
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // 60 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most daily
    },
    onAPIError: { errorURL: "/sign-in" },
    databaseHooks: {
      user: {
        create: {
          // Only emails in ALLOWED_EMAILS get an account.
          before: async (user) => {
            if (!isEmailAllowed(user.email)) throw notAllowedError();
          },
        },
      },
      session: {
        create: {
          // Checked again at every sign-in, so removing an email from
          // ALLOWED_EMAILS locks that account out.
          before: async (session) => {
            const [owner] = await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!isEmailAllowed(owner?.email)) throw notAllowedError();
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __readLaterAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.__readLaterAuth ??= createAuth();
  return globalForAuth.__readLaterAuth;
}

export type SessionUser = { id: string; email: string; name: string; image?: string | null };

/** The signed-in, allowed user, or null. Looked up once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // headers() first: it marks the page as per-request before anything
  // touches the database (so `next build` doesn't try to prerender it).
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session || !isEmailAllowed(session.user.email)) return null;
  return session.user;
});

/** Use in pages and server actions: sends signed-out visitors to sign-in. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  }
  return user;
}
