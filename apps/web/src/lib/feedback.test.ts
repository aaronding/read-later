import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { feedback } from "@/db/schema";
import { createTestDb, createTestUser } from "@/test/db";
import { MAX_FEEDBACK_LENGTH, MAX_FEEDBACK_PER_DAY, listFeedback, sendFeedback, userFeedback } from "./feedback";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
});
afterAll(() => close());

describe("feedback", () => {
  it("is stored trimmed, with its account, and listed newest first", async () => {
    expect(await sendFeedback(db, "user-1", "  Please add highlights.  ")).toEqual({ ok: true });
    expect(await sendFeedback(db, "user-2", "Delete my account, please.")).toEqual({ ok: true });
    const list = await listFeedback(db);
    expect(list.map((row) => [row.email, row.message])).toEqual([
      ["other@example.com", "Delete my account, please."],
      ["owner@example.com", "Please add highlights."],
    ]);
    expect((await userFeedback(db, "user-1")).map((row) => row.message)).toEqual(["Please add highlights."]);
  });

  it("refuses an empty or overlong message", async () => {
    expect(await sendFeedback(db, "user-1", "   ")).toEqual({ ok: false, reason: "empty" });
    expect(await sendFeedback(db, "user-1", "x".repeat(MAX_FEEDBACK_LENGTH + 1))).toEqual({ ok: false, reason: "tooLong" });
  });

  it("takes only so many messages a day from one user", async () => {
    await db.delete(feedback);
    for (let i = 0; i < MAX_FEEDBACK_PER_DAY; i++) expect((await sendFeedback(db, "user-1", `Note ${i}`)).ok).toBe(true);
    expect(await sendFeedback(db, "user-1", "One more")).toEqual({ ok: false, reason: "tooMany" });
    expect((await sendFeedback(db, "user-2", "Mine still goes")).ok).toBe(true);
  });
});
