"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="button primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/sign-in" });
        setBusy(false);
      }}
    >
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        window.location.href = "/sign-in";
      }}
    >
      Sign out
    </button>
  );
}
