import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isEmailAllowed } from "@/config/env";
import type { Db } from "@/db";
import { apiTokens, users } from "@/db/schema";

// Personal access tokens for the extension and the Shortcut. A token is shown
// once when it is created; only its SHA-256 hash is stored. Tokens are 256
// random bits, so a fast hash is enough (no password-style stretching).

const TOKEN_PREFIX = "rl_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createApiToken(db: Db, userId: string, name: string) {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [record] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: name.trim().slice(0, 100) || "Token",
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
    })
    .returning();
  return { token, record: record! };
}

export async function listApiTokens(db: Db, userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(db: Db, userId: string, tokenId: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

/**
 * Resolves "Authorization: Bearer <token>" to a user id. Returns null for a
 * missing, unknown or revoked token, or for a user no longer in
 * ALLOWED_EMAILS.
 */
export async function authenticateBearer(db: Db, authorization: string | null): Promise<string | null> {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match?.[1]?.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ tokenId: apiTokens.id, userId: apiTokens.userId, email: users.email })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hashToken(match[1])), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row || !isEmailAllowed(row.email)) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
  return row.userId;
}
