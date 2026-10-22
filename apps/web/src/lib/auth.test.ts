import { describe, expect, it } from "vitest";
import { notAllowedError } from "./auth";

describe("notAllowedError", () => {
  it("carries a code, so Better Auth's OAuth callback redirects to the sign-in page", () => {
    const error = notAllowedError();
    expect(error.status).toBe("FORBIDDEN");
    expect(error.body).toMatchObject({ code: "NOT_ALLOWED" });
  });
});
