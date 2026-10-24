import { APP_VERSION } from "@/config/app";
import { isEmailAdmin } from "@/config/env";

// Which version is deployed, for the About page. Vercel sets the commit and
// environment (its system environment variables); next.config.ts records
// when `next build` ran. Locally none of them is set.

export interface Deployment {
  version: string;
  commit?: { sha: string; short: string; url?: string };
  environment?: string;
  builtAt?: Date;
}

/** The deployed version, for an admin (ADMIN_EMAILS) only; null for anyone else. */
export function deploymentFor(email: string | null | undefined): Deployment | null {
  if (!isEmailAdmin(email)) return null;
  const env = process.env;
  const deployment: Deployment = { version: APP_VERSION };
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) {
    const { VERCEL_GIT_PROVIDER: provider, VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: repo } = env;
    deployment.commit = {
      sha,
      short: sha.slice(0, 7),
      url:
        provider === "github" && owner && repo
          ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${encodeURIComponent(sha)}`
          : undefined,
    };
  }
  if (env.VERCEL_ENV?.trim()) deployment.environment = env.VERCEL_ENV.trim();
  // Written out in full, since `next build` puts the value in its place.
  const builtAt = process.env.APP_BUILT_AT ? new Date(process.env.APP_BUILT_AT) : undefined;
  if (builtAt && !Number.isNaN(builtAt.getTime())) deployment.builtAt = builtAt;
  return deployment;
}
