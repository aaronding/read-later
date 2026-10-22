import type { Metadata } from "next";
import Link from "next/link";
import { saveSharedLinkAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { parseHttpUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "Save this link?" };

/** Shown when another website, not your Share menu, opened a share link. */
export default async function ConfirmSharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const url = parseHttpUrl(typeof params.url === "string" ? params.url : "");
  await requireUser(url ? `/share/confirm?url=${encodeURIComponent(url.href)}` : "/inbox");
  const title = typeof params.title === "string" ? params.title.slice(0, 300) : "";
  return (
    <main className="centered">
      <div className="card sign-in">
        <h1>Save this link?</h1>
        {url ? (
          <>
            <p className="muted small">Another website asked to save this link to your library.</p>
            {title && <p>{title}</p>}
            <p className="secret">{url.href}</p>
            <form action={saveSharedLinkAction}>
              <input type="hidden" name="url" value={url.href} />
              <input type="hidden" name="title" value={title} />
              <SubmitButton className="button primary" pendingText="Saving…">
                Save it
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="muted">There is no link to save.</p>
        )}
        <p>
          <Link href="/inbox">No, go to the Inbox</Link>
        </p>
      </div>
    </main>
  );
}
