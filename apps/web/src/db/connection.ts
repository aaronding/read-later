import type { PoolConfig } from "pg";

// Connection settings shared by the app's pool, the migrations and
// drizzle-kit. Imported by drizzle.config.ts too, so no "@/" imports here.

/**
 * node-postgres reads sslmode=require as verify-full today, warns that its
 * next major version will verify less, and Neon recommends verify-full, so the
 * stronger mode is spelled out. Neon's connection strings carry require.
 */
export function withVerifiedTls(connectionString: string): string {
  return connectionString.replace(/([?&])sslmode=require(?=&|$)/, "$1sslmode=verify-full");
}

/** Neon's strings ask for channel binding, which node-postgres uses only when told to. */
export function wantsChannelBinding(connectionString: string): boolean {
  return /[?&]channel_binding=require(?:&|$)/.test(connectionString);
}

/** Pool settings for a Postgres connection string (Neon's, or any other). */
export function poolConfig(connectionString: string, max: number): PoolConfig {
  return {
    connectionString: withVerifiedTls(connectionString),
    enableChannelBinding: wantsChannelBinding(connectionString),
    max,
    // On Vercel, attachDatabasePool keeps a function alive until its idle
    // connections close, so they close after Vercel's recommended 5 seconds.
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
  };
}

/**
 * Migrations need a direct connection, not Neon's pooler, which runs in
 * transaction mode. `neon env pull` writes the direct string as
 * DATABASE_URL_UNPOOLED; elsewhere DATABASE_URL is direct already.
 */
export function migrationDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || undefined;
}
