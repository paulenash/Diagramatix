"use client";

/**
 * Host side of the User Guide return trip: re-open the overlay the reader left.
 *
 * The same overlay is hosted from several pages — the Simulator opens from the
 * Dashboard, from a Project and from a Diagram — so the token names the OVERLAY
 * and each host claims the ones it can show. A host that does not render a given
 * overlay simply never calls this for that key, and the token is left alone for
 * whichever page does.
 *
 * Fires ONCE per token. The param is then stripped from the URL, because a
 * token that lingers re-opens a console the user has since closed, on the next
 * reload or Back — a small thing that feels like the app fighting you.
 */
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { REOPEN_PARAM, reopenKeyOf, urlWithoutReopen, type ReopenKey } from "@/app/lib/help/guideReturn";

export function useReopenFromGuide(key: ReopenKey, open: () => void) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const doneRef = useRef(false);
  // The opener is usually an inline arrow, so a new identity every render. Held
  // in a ref so this effect keys on the TOKEN only — otherwise it re-runs (and
  // re-opens) on every parent render.
  const openRef = useRef(open);
  openRef.current = open;

  const token = reopenKeyOf(searchParams.get(REOPEN_PARAM));

  useEffect(() => {
    if (doneRef.current || token !== key) return;
    doneRef.current = true;
    openRef.current();
    const next = urlWithoutReopen(pathname || "/", searchParams.toString());
    if (next) router.replace(next, { scroll: false });
  }, [token, key, pathname, searchParams, router]);
}
