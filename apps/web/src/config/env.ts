// All configuration comes from environment variables (see .env.example).
// Values are read lazily so that `next build` works without a database.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export function envString(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`);
  }
  return value;
}

export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** The public URL of the web app, without a trailing slash. */
export function appUrl(): string {
  return envString("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
}

/** Lower-cased emails from a variable (comma or whitespace separated). */
function emailList(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(/[\s,]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Lower-cased emails from ALLOWED_EMAILS. */
export function allowedEmails(): Set<string> {
  return emailList("ALLOWED_EMAILS");
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}

/**
 * True for the emails in ADMIN_EMAILS, who see the models' costs, Compare,
 * comparison mode and every user's AI usage. They must be in ALLOWED_EMAILS
 * too, to sign in at all.
 */
export function isEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return emailList("ADMIN_EMAILS").has(email.trim().toLowerCase());
}
