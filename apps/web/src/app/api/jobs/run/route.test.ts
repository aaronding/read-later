import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { POST } from "./route";

describe("POST /api/jobs/run", () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ close } = await createTestDb());
    process.env.JOBS_SECRET = "correct-horse-battery-staple";
  });
  afterAll(async () => {
    delete process.env.JOBS_SECRET;
    await close();
  });

  const call = (authorization?: string) =>
    POST(new Request("http://localhost/api/jobs/run", { method: "POST", headers: authorization ? { authorization } : {} }));

  it("refuses a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
  });

  it("runs jobs with the right secret", async () => {
    const response = await call("Bearer correct-horse-battery-staple");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 0, succeeded: 0, retrying: 0, failed: 0 });
  });

  it("is disabled when no secret is configured", async () => {
    delete process.env.JOBS_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
    process.env.JOBS_SECRET = "correct-horse-battery-staple";
  });
});
