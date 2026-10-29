"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { canKeep, clearKept } from "@/lib/offline/store";

export function SignInButton({ next }: { next: string }) {
  const t = useTranslations("Auth");
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
      {busy ? t("opening", { provider: "Google" }) : t("signInWith", { provider: "Google" })}
    </button>
  );
}

export function SignOutButton() {
  const t = useTranslations("Auth");
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Signing out removes the articles kept on this device (decision 154).
        if (canKeep()) await clearKept().catch(() => undefined);
        await authClient.signOut();
        window.location.href = "/sign-in";
      }}
    >
      {t("signOut")}
    </button>
  );
}
