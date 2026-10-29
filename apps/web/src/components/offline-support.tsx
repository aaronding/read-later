"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canKeep, claimOwner } from "@/lib/offline/store";
import { syncKept } from "@/lib/offline/sync";

/**
 * On every signed-in page: installs the service worker that opens the app
 * offline (decision 151), makes the kept articles the signed-in account's
 * (decision 154), and brings them up to date on each page and whenever the
 * connection comes back (decision 153).
 */
export function OfflineSupport({ userId, email }: { userId: string; email: string }) {
  const pathname = usePathname();
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    // Under `next dev` the worker would keep files that hot reloading replaces.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!canKeep()) return;
    claimOwner({ id: userId, email })
      .then(() => setClaimed(true))
      .catch(() => undefined);
  }, [userId, email]);

  useEffect(() => {
    if (!claimed) return;
    const sync = () => {
      syncKept().catch(() => undefined);
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [claimed, pathname]);

  return null;
}
