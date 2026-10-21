import type { NextConfig } from "next";
import { loadRootEnv } from "./src/config/root-env";

// One .env file at the repository root configures everything (see .env.example).
loadRootEnv();

const isProd = process.env.NODE_ENV === "production";

// Saved articles are sanitized before they are stored, and this policy is a
// second line of defence when they are rendered. Article images can come from
// any host, so img-src is open; scripts, frames and plugins are not.
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' https: http: data: blob:",
  "media-src 'self' https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
