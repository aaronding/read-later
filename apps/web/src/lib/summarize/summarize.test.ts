import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { describeApiError, isRetryableApiError } from "./summarize";

const headers = new Headers();
const body = (type: string, message: string) => ({ type: "error", error: { type, message }, request_id: "req_1" });

describe("describeApiError", () => {
  it("keeps the API's own message, not the raw JSON", () => {
    const error = Anthropic.APIError.generate(400, body("invalid_request_error", "max_tokens: too large"), undefined, headers);
    expect(describeApiError(error)).toBe("Claude API error 400: max_tokens: too large");
  });

  it("says what to do about a refused key", () => {
    const error = Anthropic.APIError.generate(401, body("authentication_error", "invalid x-api-key"), undefined, headers);
    expect(describeApiError(error)).toMatch(/^The Claude API didn't accept the API key \(invalid x-api-key\)\. Check ANTHROPIC_API_KEY/);
  });

  it("leaves out a body that isn't the API's JSON, such as a proxy's HTML page", () => {
    const error = Anthropic.APIError.generate(502, undefined, "<html><body>Bad gateway</body></html>", headers);
    expect(describeApiError(error)).toBe("Claude API error 502.");
  });

  it("describes connection failures and errors in the middle of a stream", () => {
    expect(describeApiError(new Anthropic.APIConnectionError({ message: "socket hang up" }))).toBe("Claude API error: socket hang up");
    const midStream = new Anthropic.APIError(undefined, body("overloaded_error", "Overloaded"), undefined, headers, "overloaded_error");
    expect(describeApiError(midStream)).toBe("Claude API error: Overloaded");
  });

  it("keeps a long message short", () => {
    const error = Anthropic.APIError.generate(400, body("invalid_request_error", "x".repeat(5_000)), undefined, headers);
    expect(describeApiError(error).length).toBeLessThan(400);
  });
});

describe("isRetryableApiError", () => {
  it("retries an overload reported in the middle of a stream", () => {
    const midStream = (type: string) => new Anthropic.APIError(undefined, body(type, "…"), undefined, headers, type as never);
    expect(isRetryableApiError(midStream("overloaded_error"))).toBe(true);
    expect(isRetryableApiError(midStream("api_error"))).toBe(true);
    expect(isRetryableApiError(midStream("invalid_request_error"))).toBe(false);
  });

  it("doesn't retry a refused key or a bad request", () => {
    expect(isRetryableApiError(Anthropic.APIError.generate(401, body("authentication_error", "invalid x-api-key"), undefined, headers))).toBe(false);
    expect(isRetryableApiError(Anthropic.APIError.generate(400, body("invalid_request_error", "bad"), undefined, headers))).toBe(false);
    expect(isRetryableApiError(Anthropic.APIError.generate(529, body("overloaded_error", "Overloaded"), undefined, headers))).toBe(true);
  });
});
