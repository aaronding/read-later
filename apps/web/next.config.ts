import { readdirSync } from "node:fs";
import type { NextConfig } from "next";
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

export default withNextIntl(nextConfig);
