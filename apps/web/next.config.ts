import type { NextConfig } from "next";
import { loadRootEnv } from "./src/config/root-env";

// One .env file at the repository root configures everything (see .env.example).
loadRootEnv();

// The Content Security Policy is set per request in src/proxy.ts, with a
// nonce; these headers apply to every response.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
