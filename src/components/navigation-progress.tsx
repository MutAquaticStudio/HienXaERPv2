"use client";

// FB17: the thin bar at the top of every screen. It starts on the click (before the server has answered, so the person
// sees at once that something is happening), eases towards the end, and completes when the new address is shown.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "done";
const MAX_MS = 15_000;

/** A click that will open another screen of this app in the same tab. */
export function isInternalNavigation(event: MouseEvent, location: Location): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  return url.pathname !== location.pathname || url.search !== location.search;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (!isInternalNavigation(event, window.location)) return;
      setState("loading");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("done"), MAX_MS);
    };
    document.addEventListener("click", start);
    return () => document.removeEventListener("click", start);
  }, []);

  // The new screen is there: finish the bar, then hide it.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    let hide: ReturnType<typeof setTimeout> | undefined;
    const finish = setTimeout(() => {
      setState((current) => (current === "loading" ? "done" : current));
      hide = setTimeout(() => setState((current) => (current === "done" ? "idle" : current)), 500);
    }, 0);
    return () => { clearTimeout(finish); if (hide) clearTimeout(hide); };
  }, [pathname, search]);

  return <div className="nav-progress" data-state={state} aria-hidden="true"><div className="nav-progress-bar" /></div>;
}
