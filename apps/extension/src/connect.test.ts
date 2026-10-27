import { describe, expect, it } from "vitest";
import { connectPageUrl, tokenFromRedirect } from "./connect";

const redirect = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";
const state = "0123456789abcdef0123456789abcdef";

describe("connectPageUrl", () => {
  it("asks the server's connect page to end at the browser's redirect address", () => {
    const url = new URL(connectPageUrl("https://www.readsooner.com", redirect, state));
    expect(url.origin + url.pathname).toBe("https://www.readsooner.com/extension/connect");
    // Firefox reads redirect_uri from this address and refuses any other than its own.
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(url.searchParams.get("state")).toBe(state);
  });
});

describe("tokenFromRedirect", () => {
  it("takes the token from the fragment when it answers this request", () => {
    expect(tokenFromRedirect(`${redirect}#token=rl_abc-DEF_123&state=${state}`, state)).toBe("rl_abc-DEF_123");
  });

  it("refuses an answer to another request, a refusal and anything else", () => {
    expect(tokenFromRedirect(`${redirect}#token=rl_abc&state=other`, state)).toBeNull();
    expect(tokenFromRedirect(`${redirect}#token=rl_abc`, state)).toBeNull();
    expect(tokenFromRedirect(`${redirect}#error=access_denied&state=${state}`, state)).toBeNull();
    expect(tokenFromRedirect(`${redirect}#token=abc&state=${state}`, state)).toBeNull();
    expect(tokenFromRedirect("", state)).toBeNull();
  });
});
