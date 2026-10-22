import { afterEach, describe, expect, it } from "vitest";
import { isEmailAllowed } from "./env";

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
  });
});
