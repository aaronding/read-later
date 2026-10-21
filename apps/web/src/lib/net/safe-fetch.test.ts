import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isBlockedAddress } from "./address-policy";
import { decodeHtml } from "./decode";
import { FetchError, safeFetch, type SafeFetchOptions } from "./safe-fetch";

// A local server stands in for "the internet". Tests allow 127.0.0.1 only for
// the hostname public.test; every other address keeps the production policy.
let server: http.Server;
let port: number;
let lastUserAgent = "";

const fakeDns: Record<string, dns.LookupAddress[]> = {
  "public.test": [{ address: "127.0.0.1", family: 4 }],
  "internal.test": [{ address: "10.0.0.7", family: 4 }],
  "metadata.test": [{ address: "169.254.169.254", family: 4 }],
  "mixed.test": [
    { address: "127.0.0.1", family: 4 },
    { address: "192.168.0.10", family: 4 },
  ],
};

const fakeLookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
  const addresses = fakeDns[hostname];
  if (!addresses) {
    const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
    return callback(error);
  }
  callback(null, addresses);
}) as unknown as typeof dns.lookup;

function options(overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return {
    userAgent: "ReadLater-Test/1.0 (+https://example.com)",
    timeoutMs: 2_000,
    maxBytes: 64 * 1024,
    lookup: fakeLookup,
    // 127.0.0.1 is reachable only through the test hostnames above.
    isAddressBlocked: (address) => address !== "127.0.0.1" && isBlockedAddress(address),
    ...overrides,
  };
}

const base = () => `http://public.test:${port}`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastUserAgent = req.headers["user-agent"] ?? "";
    const path = req.url ?? "/";
    if (path === "/article") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end("<html><body><p>Hello</p></body></html>");
    }
    if (path === "/to-article") {
      res.writeHead(302, { location: "/article" });
      return res.end();
    }
    if (path === "/to-internal") {
      res.writeHead(302, { location: `http://internal.test:${port}/secret` });
      return res.end();
    }
    if (path === "/to-metadata-ip") {
      res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (path === "/to-metadata-host") {
      res.writeHead(307, { location: "http://metadata.test/latest/meta-data/" });
      return res.end();
    }
    if (path === "/to-file") {
      res.writeHead(302, { location: "file:///etc/passwd" });
      return res.end();
    }
    if (path === "/loop") {
      res.writeHead(302, { location: "/loop" });
      return res.end();
    }
    if (path === "/slow") {
      return; // never answers
    }
    if (path === "/big-declared") {
      res.writeHead(200, { "content-type": "text/html", "content-length": String(10 * 1024 * 1024) });
      return res.end();
    }
    if (path === "/big-streamed") {
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = "x".repeat(16 * 1024);
      for (let i = 0; i < 20; i++) res.write(chunk);
      return res.end();
    }
    if (path === "/gzip-bomb") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x61)));
    }
    if (path === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(zlib.gzipSync("<p>compressed</p>"));
    }
    if (path === "/login") {
      res.writeHead(401, { "content-type": "text/html" });
      return res.end("<form><input type=password></form>");
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function fetchError(url: string, opts = options()): Promise<FetchError> {
  try {
    await safeFetch(url, opts);
  } catch (error) {
    if (error instanceof FetchError) return error;
    throw error;
  }
  throw new Error("expected the download to fail");
}

describe("safeFetch", () => {
  it("downloads a page and sends an honest User-Agent", async () => {
    const response = await safeFetch(`${base()}/article`, options());
    expect(response.status).toBe(200);
    expect(response.body.toString()).toContain("Hello");
    expect(lastUserAgent).toBe("ReadLater-Test/1.0 (+https://example.com)");
  });

  it("follows redirects on the same allowed host", async () => {
    const response = await safeFetch(`${base()}/to-article`, options());
    expect(response.url).toBe(`${base()}/article`);
    expect(response.redirects).toHaveLength(1);
  });

  it("decompresses gzip", async () => {
    const response = await safeFetch(`${base()}/gzip`, options());
    expect(response.body.toString()).toBe("<p>compressed</p>");
  });

  it("returns non-2xx responses so callers can spot login walls", async () => {
    const response = await safeFetch(`${base()}/login`, options());
    expect(response.status).toBe(401);
  });

  it("refuses non-http schemes", async () => {
    expect((await fetchError("ftp://public.test/file")).code).toBe("bad_url");
    expect((await fetchError("file:///etc/passwd")).code).toBe("bad_url");
  });

  it("refuses URLs with credentials", async () => {
    expect((await fetchError(`http://user:pass@public.test:${port}/article`)).code).toBe("bad_url");
  });

  describe("address blocking", () => {
    it("refuses loopback, private and metadata IP literals with the production policy", async () => {
      const production = options({ isAddressBlocked: undefined });
      for (const url of [
        `http://127.0.0.1:${port}/article`,
        "http://10.1.2.3/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
      ]) {
        const error = await fetchError(url, production);
        expect(error.code, url).toBe("blocked_address");
        expect(error.retryable).toBe(false);
      }
    });

    it("refuses hostnames that resolve to private addresses", async () => {
      expect((await fetchError(`http://internal.test:${port}/`)).code).toBe("blocked_address");
    });

    it("refuses a hostname when any of its addresses is private", async () => {
      expect((await fetchError(`http://mixed.test:${port}/article`)).code).toBe("blocked_address");
    });

    it("refuses a redirect to a private hostname", async () => {
      expect((await fetchError(`${base()}/to-internal`)).code).toBe("blocked_address");
    });

    it("refuses a redirect to the cloud metadata address, by IP and by name", async () => {
      expect((await fetchError(`${base()}/to-metadata-ip`)).code).toBe("blocked_address");
      expect((await fetchError(`${base()}/to-metadata-host`)).code).toBe("blocked_address");
    });

    it("refuses a redirect to a non-http scheme", async () => {
      expect((await fetchError(`${base()}/to-file`)).code).toBe("bad_url");
    });
  });

  describe("limits", () => {
    it("stops redirect loops", async () => {
      expect((await fetchError(`${base()}/loop`)).code).toBe("too_many_redirects");
    });

    it("times out", async () => {
      const error = await fetchError(`${base()}/slow`, options({ timeoutMs: 200 }));
      expect(error.code).toBe("timeout");
      expect(error.retryable).toBe(true);
    });

    it("refuses bodies over the size limit, declared or streamed", async () => {
      expect((await fetchError(`${base()}/big-declared`)).code).toBe("too_large");
      expect((await fetchError(`${base()}/big-streamed`)).code).toBe("too_large");
    });

    it("counts the size after decompression", async () => {
      expect((await fetchError(`${base()}/gzip-bomb`)).code).toBe("too_large");
    });
  });
});

describe("decodeHtml", () => {
  it("uses the charset from the Content-Type header", () => {
    const latin1 = Buffer.from("<p>caf\xe9</p>", "latin1");
    expect(decodeHtml(latin1, "text/html; charset=ISO-8859-1")).toBe("<p>café</p>");
  });

  it("falls back to <meta charset>", () => {
    // "中文" in GBK.
    const gbk = Buffer.concat([Buffer.from('<meta charset="gbk"><p>'), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from("</p>")]);
    expect(decodeHtml(gbk, "text/html")).toContain("中文");
  });

  it("defaults to UTF-8", () => {
    expect(decodeHtml(Buffer.from("<p>日本語</p>"), "")).toBe("<p>日本語</p>");
  });
});
