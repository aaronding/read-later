import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";
import { APP_NAME } from "@/config/app";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site paths, so the sign-in page can't be used to redirect elsewhere. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/inbox";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next);
  const error = params.error;
  return (
    <main className="centered">
      <div className="card sign-in">
        <Image src="/icons/icon-192.png" alt="" width={56} height={56} priority />
        <h1>{APP_NAME}</h1>
        <p className="muted">Save articles to read later, with a clean copy and an AI summary.</p>
        {error && (
          <p className="notice error small">
            Sign-in didn’t work. Only Google accounts listed in the server’s ALLOWED_EMAILS can sign in.
          </p>
        )}
        <SignInButton next={next} />
      </div>
    </main>
  );
}
