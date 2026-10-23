import { afterEach, describe, expect, it } from "vitest";
import { isEmailAdmin, isEmailAllowed, signUpIsOpen } from "./env";

describe("ALLOWED_EMAILS", () => {
  const original = process.env.ALLOWED_EMAILS;
  afterEach(() => {
    process.env.ALLOWED_EMAILS = original;
  });

  it("accepts listed emails, ignoring case and spacing", () => {
    process.env.ALLOWED_EMAILS = " Owner@Example.com, second@example.com\nthird@example.com ";
    expect(isEmailAllowed("owner@example.com")).toBe(true);
    expect(isEmailAllowed("SECOND@example.com")).toBe(true);
    expect(isEmailAllowed("third@example.com")).toBe(true);
  });

  it("rejects everyone else, and everyone when the list is empty", () => {
    process.env.ALLOWED_EMAILS = "owner@example.com";
    expect(isEmailAllowed("stranger@example.com")).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    process.env.ALLOWED_EMAILS = "";
    expect(isEmailAllowed("owner@example.com")).toBe(false);
    expect(signUpIsOpen()).toBe(false);
  });

  it("lets anyone in when it is *", () => {
    process.env.ALLOWED_EMAILS = "*";
    expect(signUpIsOpen()).toBe(true);
    expect(isEmailAllowed("stranger@example.com")).toBe(true);
    expect(isEmailAllowed("")).toBe(false);
  });
});

describe("BLOCKED_EMAILS", () => {
  const original = { allowed: process.env.ALLOWED_EMAILS, blocked: process.env.BLOCKED_EMAILS };
  afterEach(() => {
    process.env.ALLOWED_EMAILS = original.allowed;
    if (original.blocked === undefined) delete process.env.BLOCKED_EMAILS;
    else process.env.BLOCKED_EMAILS = original.blocked;
  });

  it("keeps the listed emails out, whatever ALLOWED_EMAILS says", () => {
    process.env.BLOCKED_EMAILS = " Spammer@Example.com ";
    process.env.ALLOWED_EMAILS = "*";
    expect(isEmailAllowed("spammer@example.com")).toBe(false);
    expect(isEmailAllowed("stranger@example.com")).toBe(true);
    process.env.ALLOWED_EMAILS = "owner@example.com, spammer@example.com";
    expect(isEmailAllowed("SPAMMER@example.com")).toBe(false);
    expect(isEmailAllowed("owner@example.com")).toBe(true);
  });
});

describe("ADMIN_EMAILS", () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  });

  it("makes the listed emails admins, ignoring case and spacing, and no one else", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com,\nsecond@example.com ";
    expect(isEmailAdmin("owner@example.com")).toBe(true);
    expect(isEmailAdmin("SECOND@example.com")).toBe(true);
    expect(isEmailAdmin("third@example.com")).toBe(false);
    expect(isEmailAdmin(null)).toBe(false);
    process.env.ADMIN_EMAILS = "";
    expect(isEmailAdmin("owner@example.com")).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(isEmailAdmin("owner@example.com")).toBe(false);
  });
});
