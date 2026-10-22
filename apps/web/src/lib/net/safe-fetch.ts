import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { isBlockedAddress } from "./address-policy";

export type FetchErrorCode =
  | "bad_url"
  | "blocked_address"
  | "too_many_redirects"
  | "timeout"
  | "too_large"
  | "network";

/** A download that failed before we had a usable response. */
export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
    /** Worth trying again later (timeouts, network trouble). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface SafeFetchOptions {
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  accept?: string;
  /** Tests replace DNS. */
  lookup?: typeof dns.lookup;
  /** Tests can allow a local server. Production always uses isBlockedAddress. */
  isAddressBlocked?: (address: string) => boolean;
}

export interface SafeFetchResponse {
  /** The URL after redirects. */
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  contentType: string;
  body: Buffer;
  redirects: string[];
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("bad_url", `Not a valid URL: ${raw}`, false);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("bad_url", "Only http and https links can be downloaded.", false);
  }
  if (url.username || url.password) {
    throw new FetchError("bad_url", "Links with a username or password are not downloaded.", false);
  }
  return url;
}

/**
 * DNS lookup that refuses blocked addresses. It runs for the connection that
 * is actually made, so a hostname cannot pass the check and then resolve to a
 * private address (DNS rebinding).
 */
function guardedLookup(baseLookup: typeof dns.lookup, isBlocked: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    baseLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      const list = addresses as dns.LookupAddress[];
      if (list.length === 0) {
        return callback(new FetchError("network", `No address found for ${hostname}.`, true), "", 0);
      }
      const blocked = list.find((entry) => isBlocked(entry.address));
      if (blocked) {
        return callback(
          new FetchError("blocked_address", `${hostname} points to a private or reserved address.`, false),
          "",
          0,
        );
      }
      if (options.all) {
        (callback as unknown as (err: null, addresses: dns.LookupAddress[]) => void)(null, list);
      } else {
        callback(null, list[0]!.address, list[0]!.family);
      }
    });
  };
}

function decodedStream(response: http.IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
  switch (encoding) {
    case "gzip":
    case "x-gzip":
      return response.pipe(zlib.createGunzip());
    case "deflate":
      return response.pipe(zlib.createInflate());
    case "br":
      return response.pipe(zlib.createBrotliDecompress());
    default:
      return response;
  }
}

interface Hop {
  response: http.IncomingMessage;
  request: http.ClientRequest;
}

function requestOnce(url: URL, options: SafeFetchOptions, signal: AbortSignal): Promise<Hop> {
  const isBlocked = options.isAddressBlocked ?? isBlockedAddress;
  // IP literals skip DNS, so they are checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlocked(host)) {
    throw new FetchError("blocked_address", `${host} is a private or reserved address.`, false);
  }
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": options.userAgent,
          accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
        lookup: guardedLookup(options.lookup ?? dns.lookup, isBlocked),
        // Browsers and curl name the protocol they'll speak in the TLS
        // handshake (ALPN). Node leaves it out unless asked, and some sites'
        // bot protection refuses such handshakes: CNN answered Node's
        // HTTP/1.1 requests with a 403 and curl's with the page.
        ...(url.protocol === "https:" ? { ALPNProtocols: ["http/1.1"] } : {}),
        signal,
      },
      (response) => resolve({ response, request }),
    );
    request.on("error", (error) => {
      if (error instanceof FetchError) return reject(error);
      if (signal.aborted) return reject(signal.reason);
      reject(new FetchError("network", `Could not download the page: ${error.message}`, true));
    });
    request.end();
  });
}

function readBody(hop: Hop, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const declared = Number(hop.response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    hop.request.destroy();
    return Promise.reject(new FetchError("too_large", "The page is too large to save.", false));
  }
  return new Promise((resolve, reject) => {
    const stream = decodedStream(hop.response);
    const chunks: Buffer[] = [];
    let total = 0;
    const fail = (error: Error) => {
      hop.request.destroy();
      stream.destroy();
      reject(error);
    };
    signal.addEventListener("abort", () => fail(signal.reason as Error), { once: true });
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      // Counted after decompression, so a small compressed bomb is stopped too.
      if (total > maxBytes) return fail(new FetchError("too_large", "The page is too large to save.", false));
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (error) =>
      fail(error instanceof FetchError ? error : new FetchError("network", `Download interrupted: ${error.message}`, true)),
    );
  });
}

/**
 * Downloads a page for extraction. http(s) only; private, loopback and
 * link-local addresses are refused on every hop, including after redirects;
 * the whole download has one time limit and a size limit.
 * Non-2xx responses are returned, not thrown, so the caller can tell a login
 * wall (401/403) from a missing page.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new FetchError("timeout", "The site took too long to respond.", true)),
    options.timeoutMs,
  );
  const redirects: string[] = [];
  try {
    let url = checkUrl(rawUrl);
    for (;;) {
      const hop = await requestOnce(url, options, controller.signal);
      const status = hop.response.statusCode ?? 0;
      const location = hop.response.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        hop.response.resume();
        hop.request.destroy();
        if (redirects.length >= maxRedirects) {
          throw new FetchError("too_many_redirects", "The page redirects too many times.", false);
        }
        url = checkUrl(new URL(location, url).href);
        redirects.push(url.href);
        continue;
      }
      const body = await readBody(hop, options.maxBytes, controller.signal);
      return {
        url: url.href,
        status,
        headers: hop.response.headers,
        contentType: String(hop.response.headers["content-type"] ?? ""),
        body,
        redirects,
      };
    }
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (controller.signal.aborted && controller.signal.reason instanceof FetchError) throw controller.signal.reason;
    throw new FetchError("network", `Could not download the page: ${(error as Error).message}`, true);
  } finally {
    clearTimeout(timer);
  }
}
