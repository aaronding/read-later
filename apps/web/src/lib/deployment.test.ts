import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_VERSION } from "@/config/app";
import { deploymentFor } from "./deployment";

// The About page shows the deployed version to admins only.

const VARIABLES = [
  "ADMIN_EMAILS",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_PROVIDER",
  "VERCEL_GIT_REPO_OWNER",
  "VERCEL_GIT_REPO_SLUG",
  "VERCEL_ENV",
  "APP_BUILT_AT",
];
const saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of VARIABLES) delete process.env[name];
  process.env.ADMIN_EMAILS = "owner@example.com";
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const onVercel = () =>
  Object.assign(process.env, {
    VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
    VERCEL_GIT_PROVIDER: "github",
    VERCEL_GIT_REPO_OWNER: "aaronding",
    VERCEL_GIT_REPO_SLUG: "read-later",
    VERCEL_ENV: "production",
    APP_BUILT_AT: "2026-10-23T08:15:00.000Z",
  });

describe("the deployed version", () => {
  it("is shown to no one but an admin", () => {
    onVercel();
    expect(deploymentFor("reader@example.com")).toBeNull();
    expect(deploymentFor(null)).toBeNull();
    expect(deploymentFor(undefined)).toBeNull();
    delete process.env.ADMIN_EMAILS;
    expect(deploymentFor("owner@example.com")).toBeNull();
  });

  it("names the version, the commit with its link, the environment and the build time", () => {
    onVercel();
    expect(deploymentFor("Owner@Example.com")).toEqual({
      version: APP_VERSION,
      commit: {
        sha: "0123456789abcdef0123456789abcdef01234567",
        short: "0123456",
        url: "https://github.com/aaronding/read-later/commit/0123456789abcdef0123456789abcdef01234567",
      },
      environment: "production",
      builtAt: new Date("2026-10-23T08:15:00.000Z"),
    });
  });

  it("leaves out what isn't set, as in local development", () => {
    expect(deploymentFor("owner@example.com")).toEqual({ version: APP_VERSION });
    process.env.VERCEL_GIT_COMMIT_SHA = "0123456789abcdef";
    process.env.APP_BUILT_AT = "not a date";
    expect(deploymentFor("owner@example.com")).toEqual({
      version: APP_VERSION,
      commit: { sha: "0123456789abcdef", short: "0123456", url: undefined },
    });
  });
});
