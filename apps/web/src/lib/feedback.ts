import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { feedback, users } from "@/db/schema";
import { MAX_FEEDBACK_LENGTH, MAX_FEEDBACK_PER_DAY } from "./feedback-limits";

// The About page's feedback form: the app's only way to reach the owner,
// deletion requests included. Only signed-in users can send it, so every
// message names its account and no form is left open to spam.

export { MAX_FEEDBACK_LENGTH, MAX_FEEDBACK_PER_DAY };

export type FeedbackResult = { ok: true } | { ok: false; reason: "empty" | "tooLong" | "tooMany" };

export async function sendFeedback(db: Db, userId: string, text: string): Promise<FeedbackResult> {
  const message = text.trim();
  if (!message) return { ok: false, reason: "empty" };
  if (message.length > MAX_FEEDBACK_LENGTH) return { ok: false, reason: "tooLong" };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [sent] = await db
    .select({ count: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), gt(feedback.createdAt, since)));
  if ((sent?.count ?? 0) >= MAX_FEEDBACK_PER_DAY) return { ok: false, reason: "tooMany" };
  await db.insert(feedback).values({ userId, message });
  return { ok: true };
}

/** Every user's feedback, newest first, for the admins. */
export async function listFeedback(db: Db, limit = 200) {
  return db
    .select({
      id: feedback.id,
      message: feedback.message,
      createdAt: feedback.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(feedback)
    .innerJoin(users, eq(users.id, feedback.userId))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
}

/** One user's own feedback, for their export. */
export async function userFeedback(db: Db, userId: string) {
  return db
    .select({ message: feedback.message, sentAt: feedback.createdAt })
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(feedback.createdAt);
}
