import { and, eq, gte, sql } from "drizzle-orm";
import type { createFormatter } from "next-intl";
import { isEmailAdmin } from "@/config/env";
import type { Db } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { chargedUsd, periodStart } from "@/lib/usage";

// Each user's monthly allowance of Claude: what their answers cost the owner
// this calendar month, in UTC, against AI_MONTHLY_LIMIT_USD. Users see only
// the share they have used, never dollars. Admins have no limit.

/** From this share on, the app tells the user they are close to the limit. */
export const WARN_AT = 0.8;

const DEFAULT_LIMIT_USD = 1;

/** A limit in dollars from a variable's value: a number of 0 or more, or "none" for no limit. */
function parseLimit(raw: string): number | null | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "none") return null;
  const amount = Number(value);
  return value && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

/**
 * The monthly limit in dollars for this email, or null for none. Admins have
 * none; AI_MONTHLY_LIMIT_EXCEPTIONS (`email=amount` or `email=none`, comma or
 * space separated) sets one user's; everyone else has AI_MONTHLY_LIMIT_USD. A
 * missing or unreadable value means the default, never no limit.
 */
export function monthlyLimitUsd(email: string | null | undefined): number | null {
  if (isEmailAdmin(email)) return null;
  const address = email?.trim().toLowerCase();
  for (const entry of (process.env.AI_MONTHLY_LIMIT_EXCEPTIONS ?? "").split(/[\s,]+/)) {
    const at = entry.lastIndexOf("=");
    if (at > 0 && entry.slice(0, at).toLowerCase() === address) {
      const limit = parseLimit(entry.slice(at + 1));
      if (limit !== undefined) return limit;
    }
  }
  const fallback = parseLimit(process.env.AI_MONTHLY_LIMIT_USD ?? "");
  return fallback === undefined ? DEFAULT_LIMIT_USD : fallback;
}

export interface Allowance {
  /** The month's limit in dollars, or null for none. Never shown to the user. */
  limitUsd: number | null;
  /** What the month's answers cost so far. Never shown to the user. */
  usedUsd: number;
  /** The share of the limit used, from 0, and over 1 when answers that ran at once took it past; 0 with no limit. */
  share: number;
  /** The first moment of next month, in UTC. */
  renewsAt: Date;
  /** Used up: new summaries and translations wait for next month. */
  reached: boolean;
  /** Close to the limit, but not at it. */
  nearing: boolean;
}

/** The share as a whole percent, rounded down so 99.6% isn't shown as all of it, and at most 100. */
export function sharePercent(allowance: Pick<Allowance, "share">): number {
  return Math.min(100, Math.floor(allowance.share * 100));
}

/** The user's allowance this month. */
export async function getAllowance(db: Db, userId: string, now = new Date()): Promise<Allowance> {
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const limitUsd = monthlyLimitUsd(owner?.email);
  const start = periodStart("month", now);
  const renewsAt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${chargedUsd}), 0)`.mapWith(Number) })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, start)));
  const usedUsd = row?.used ?? 0;
  if (limitUsd === null) return { limitUsd, usedUsd, share: 0, renewsAt, reached: false, nearing: false };
  const share = limitUsd === 0 ? 1 : usedUsd / limitUsd;
  const reached = usedUsd >= limitUsd;
  return { limitUsd, usedUsd, share, renewsAt, reached, nearing: !reached && share >= WARN_AT };
}

/** The share for a message's `{share, number, percent}`, as sharePercent() rounds it. */
export function shareValue(allowance: Pick<Allowance, "share">): number {
  return sharePercent(allowance) / 100;
}

/** The day the allowance renews, in the app's language: the month starts in UTC, so the date is UTC's. */
export function renewalDate(format: Pick<ReturnType<typeof createFormatter>, "dateTime">, allowance: Pick<Allowance, "renewsAt">): string {
  return format.dateTime(allowance.renewsAt, { day: "numeric", month: "long", timeZone: "UTC" });
}
