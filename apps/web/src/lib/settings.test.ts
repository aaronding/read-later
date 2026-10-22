import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { userAppearance, userSettings } from "@/db/schema";
import { createTestDb, createTestUser } from "@/test/db";
import { DEFAULT_APPEARANCE } from "./appearance";
import { getAppearance, saveAppearance } from "./settings";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createTestUser(db);
  await createTestUser(db, "other@example.com", "user-2");
});
afterAll(() => close());

describe("appearance", () => {
  it("is the default until the user chooses one", async () => {
    expect(await getAppearance(db, "user-1")).toEqual(DEFAULT_APPEARANCE);
  });

  it("is saved to the account and replaced by the next choice", async () => {
    await saveAppearance(db, "user-1", { theme: "dark", light: "sepia", dark: "black", font: "literata" });
    await saveAppearance(db, "user-1", { theme: "system", light: "sepia", dark: "midnight", font: "literata" });
    expect(await getAppearance(db, "user-1")).toEqual({ theme: "system", light: "sepia", dark: "midnight", font: "literata" });
    expect(await db.select().from(userAppearance)).toHaveLength(1);
  });

  it("belongs to one user only", async () => {
    expect(await getAppearance(db, "user-2")).toEqual(DEFAULT_APPEARANCE);
  });

  it("doesn't create summary settings, so the default model still comes from the environment", async () => {
    expect(await db.select().from(userSettings)).toEqual([]);
  });

  it("falls back to the default for a stored choice that no longer exists", async () => {
    await saveAppearance(db, "user-2", { theme: "light", light: "mist", dark: "dusk", font: "sans" });
    await db.update(userAppearance).set({ lightPalette: "neon" }).where(eq(userAppearance.userId, "user-2"));
    expect(await getAppearance(db, "user-2")).toEqual({ theme: "light", light: DEFAULT_APPEARANCE.light, dark: "dusk", font: "sans" });
  });
});
