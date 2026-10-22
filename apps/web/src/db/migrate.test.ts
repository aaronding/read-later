import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createTestUser } from "@/test/db";
import type { Db } from "./index";
import { articles } from "./schema";

describe("migrations", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it("create a schema that accepts an article", async () => {
    const user = await createTestUser(db);
    const [article] = await db
      .insert(articles)
      .values({ userId: user.id, url: "https://example.com/a", normalizedUrl: "https://example.com/a" })
      .returning();
    expect(article?.status).toBe("pending");
    expect(article?.previewOnly).toBe(false);
  });
});
