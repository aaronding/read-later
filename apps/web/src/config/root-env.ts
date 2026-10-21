import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// @next/env is CommonJS without detectable named exports, so it is loaded
// with require() to work both in next.config.ts and in plain ES modules.
const { updateInitialEnv } = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");

// One .env file at the repository root configures the web app, the worker,
// the migrations and Docker Compose. Variables already set in the real
// environment (Vercel, Docker) win; .env.local wins over .env.

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export function loadRootEnv(root = repoRoot): void {
  const loaded: Record<string, string> = {};
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    const parsed = parseEnv(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined || key in loaded || process.env[key] !== undefined) continue;
      loaded[key] = value;
    }
  }
  Object.assign(process.env, loaded);
  // Next.js restores a snapshot of process.env whenever it reloads its own
  // env files; adding our values to that snapshot keeps them.
  updateInitialEnv(loaded);
}
