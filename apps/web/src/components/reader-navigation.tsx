"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackIcon } from "./icons";

// Going back from the reader to the list it was opened from. When that list
// opened the reader in this tab, and nothing was opened from the reader
// since, Back is the browser's Back: the list comes back as it was left,
// scrolled to the same place, and the browser's own Back still makes sense
// afterwards. Otherwise, as after a reload or when the article was opened
// from the extension, Back opens the list. See docs/decisions.md.

/** The reader a list is opening, until the reader shows it. */
let opening: string | null = null;
/** The reader that a list opened, and how long the tab's history was then. */
let opened: { href: string; length: number } | null = null;
/** Set when the reader goes back, so the list, which the browser shows as it was, catches up. */
let listIsStale = false;

function currentHref(): string {
  return window.location.pathname + window.location.search;
}

function isPlainClick(event: React.MouseEvent | MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Whether the page before this reader in the tab's history is the list it was opened from. */
function canGoBack(): boolean {
  return opened !== null && opened.href === currentHref() && window.history.length === opened.length;
}

function goBack(router: ReturnType<typeof useRouter>) {
  listIsStale = true;
  router.back();
}

/** On a list: notes which article it opens, and catches up when the reader comes back to it. */
export function ListHistory() {
  const router = useRouter();
  useEffect(() => {
    if (listIsStale) {
      listIsStale = false;
      router.refresh();
    }
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!isPlainClick(event) || !(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/articles/") && url.searchParams.has("from")) {
        opening = url.pathname + url.search;
      }
    };
    // Capturing, so this runs before the link's own handler starts the navigation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
  return null;
}

/** A link back to the list the reader was opened from: the list's tab and the floating Back button. */
export function BackLink({ href, onClick, ...rest }: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPlainClick(event) || !canGoBack()) return;
        event.preventDefault();
        goBack(router);
      }}
    />
  );
}

/**
 * A reader form whose action is done with the article: Archive, Mark unread
 * and Delete. Once the action has run, the reader goes back to its list. The
 * action doesn't refresh the reader it is leaving (`leaving`), which after a
 * delete would show "not found" for a moment.
 */
export function LeavingForm({
  action,
  back,
  className = "inline-form",
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  back: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <form
      className={className}
      action={async (formData) => {
        await action(formData);
        if (canGoBack()) goBack(router);
        else router.replace(back);
      }}
    >
      <input type="hidden" name="leaving" value="true" />
      {children}
    </form>
  );
}

/**
 * The round Back button. On wide screens it sits in the margin beside the
 * article and stays in view, which CSS does alone. On narrower ones it floats
 * in the bottom corner, where it would cover the text, so it stays out of the
 * way: hidden while the header's tabs are on screen and while scrolling down,
 * and shown when scrolling up or at the end of the article.
 */
export function FloatingBack({ href, label }: { href: string; label: string }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (opening !== null && opening === currentHref()) {
      opened = { href: opening, length: window.history.length };
    }
    opening = null;
  }, []);

  useEffect(() => {
    // Scrolling must travel this far in one direction to show or hide the button, so it doesn't flicker.
    const STEP = 24;
    let anchor = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const header = document.querySelector(".topbar");
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 80;
      if (header && header.getBoundingClientRect().bottom > 0) setHidden(true);
      else if (atEnd || y < anchor - STEP) setHidden(false);
      else if (y > anchor + STEP) setHidden(true);
      if (Math.abs(y - anchor) > STEP) anchor = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="floating-back-rail">
      <BackLink href={href} className="floating-back" aria-label={label} title={label} data-hidden={hidden || undefined}>
        <BackIcon />
      </BackLink>
    </div>
  );
}
