import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { englishText } from "@/i18n/stored-message";
import { describeApiError, isRetryableApiError } from "./summarize";

const headers = new Headers();
const body = (type: string, message: string) => ({ type: "error", error: { type, message }, request_id: "req_1" });

// describeApiError's message, in English.
const inEnglish = (error: InstanceType<typeof Anthropic.APIError>) => englishText(describeApiError(error));

describe("describeApiError", () => {
  it("keeps the API's own message, not the raw JSON", async () => {
    const error = Anthropic.APIError.generate(400, body("invalid_request_error", "max_tokens: too large"), undefined, headers);
    expect(describeApiError(error)).toEqual({
      key: "summary.apiErrorStatusWithDetail",
      values: { status: "400", detail: "max_tokens: too large" },
    });
    expect(await inEnglish(error)).toBe("AI service error 400: max_tokens: too large");
  });

  it("says what to do about a refused key", async () => {
    const error = Anthropic.APIError.generate(401, body("authentication_error", "invalid x-api-key"), undefined, headers);
    expect(describeApiError(error)).toMatchObject({
      key: "summary.apiKeyRejectedWithDetail",
      values: { detail: "invalid x-api-key", variable: "ANTHROPIC_API_KEY" },
    });
    expect(await inEnglish(error)).toMatch(/^The AI service didn’t accept the API key \(invalid x-api-key\)\. Check ANTHROPIC_API_KEY/);
  });

  it("leaves out a body that isn't the API's JSON, such as a proxy's HTML page", async () => {
    const error = Anthropic.APIError.generate(502, undefined, "<html><body>Bad gateway</body></html>", headers);
    expect(await inEnglish(error)).toBe("AI service error 502.");
  });

  it("describes connection failures and errors in the middle of a stream", async () => {
    expect(await inEnglish(new Anthropic.APIConnectionError({ message: "socket hang up" }))).toBe("AI service error: socket hang up");
    const midStream = new Anthropic.APIError(undefined, body("overloaded_error", "Overloaded"), undefined, headers, "overloaded_error");
    expect(await inEnglish(midStream)).toBe("AI service error: Overloaded");
  });

  it("keeps a long message short", async () => {
    const error = Anthropic.APIError.generate(400, body("invalid_request_error", "x".repeat(5_000)), undefined, headers);
    expect((await inEnglish(error)).length).toBeLessThan(400);
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
