import { afterEach, describe, expect, it, vi } from "vitest";
import { migrationDatabaseUrl, poolConfig, wantsChannelBinding, withVerifiedTls } from "./connection";

// Shaped like Neon's strings, with their parameters in either order.
const pooled = "postgresql://owner:pw@ep-x-pooler.c-6.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const direct = "postgresql://owner:pw@ep-x.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const local = "postgres://postgres:postgres@localhost:5432/readlater";

describe("withVerifiedTls", () => {
  it("spells out verify-full for Neon's sslmode=require, wherever it sits", () => {
    expect(withVerifiedTls(pooled)).toBe(pooled.replace("sslmode=require", "sslmode=verify-full"));
    expect(withVerifiedTls(direct)).toBe(direct.replace("sslmode=require", "sslmode=verify-full"));
  });

  it("leaves other modes and strings without TLS alone", () => {
    expect(withVerifiedTls(local)).toBe(local);
    expect(withVerifiedTls(`${local}?sslmode=disable`)).toBe(`${local}?sslmode=disable`);
    expect(withVerifiedTls(`${local}?sslmode=verify-full`)).toBe(`${local}?sslmode=verify-full`);
  });
});

describe("wantsChannelBinding", () => {
  it("follows channel_binding=require", () => {
    expect(wantsChannelBinding(pooled)).toBe(true);
    expect(wantsChannelBinding(direct)).toBe(true);
    expect(wantsChannelBinding(local)).toBe(false);
    expect(wantsChannelBinding(`${local}?channel_binding=disable`)).toBe(false);
  });
});

describe("poolConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses Vercel's short idle timeout only on Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(poolConfig(pooled, 5)).toMatchObject({ max: 5, idleTimeoutMillis: 30_000, enableChannelBinding: true });
    vi.stubEnv("VERCEL", "1");
    expect(poolConfig(pooled, 5).idleTimeoutMillis).toBe(5_000);
  });

  it("passes the verify-full string to node-postgres", () => {
    expect(poolConfig(pooled, 1).connectionString).toContain("sslmode=verify-full");
  });
});

describe("migrationDatabaseUrl", () => {
  it("prefers Neon's direct string, since the pooler runs in transaction mode", () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct })).toBe(direct);
    expect(migrationDatabaseUrl({ DATABASE_URL: local })).toBe(local);
    expect(migrationDatabaseUrl({ DATABASE_URL: local, DATABASE_URL_UNPOOLED: "" })).toBe(local);
    expect(migrationDatabaseUrl({})).toBeUndefined();
  });
});
