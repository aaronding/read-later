import { describe, expect, it, vi } from "vitest";
import { runJobs } from "./index";

describe("runJobs", () => {
  it("posts to /api/jobs/run with the secret", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true,"claimed":2}', { status: 200 }));
    const body = await runJobs({ APP_URL: "https://read.example.com/", JOBS_SECRET: "s3cret" }, fetchImpl);
    expect(body).toBe('{"ok":true,"claimed":2}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://read.example.com/api/jobs/run");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
  });

  it("fails loudly on a wrong secret or missing settings", async () => {
    const unauthorized = vi.fn(async () => new Response('{"ok":false}', { status: 401 }));
    await expect(runJobs({ APP_URL: "https://read.example.com", JOBS_SECRET: "wrong" }, unauthorized)).rejects.toThrow(/401/);
    await expect(runJobs({ APP_URL: "", JOBS_SECRET: "" })).rejects.toThrow(/Set APP_URL/);
  });
});
