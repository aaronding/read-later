import { readdirSync } from "node:fs";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
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

// next-intl finds its request config in src/i18n/request.ts. It also writes a
// type declaration next to each English message file, so message arguments
// are type-checked (`next typegen` does this before `tsc`).
const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: readdirSync(new URL("./messages/en", import.meta.url))
      .filter((file) => file.endsWith(".json"))
      .map((file) => `./messages/en/${file}`),
  },
});

// When this build was made, for the About page (src/lib/deployment.ts). Only
// `next build` records it; `next dev` leaves it out.
export default function config(phase: string): NextConfig {
  return withNextIntl({
    ...nextConfig,
    env: phase === PHASE_PRODUCTION_BUILD ? { APP_BUILT_AT: new Date().toISOString() } : {},
  });
}
