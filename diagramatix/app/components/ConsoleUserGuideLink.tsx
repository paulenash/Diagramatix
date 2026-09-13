"use client";

/**
 * The "📖 User Guide" chip a full-screen console puts in its header.
 *
 * Four consoles had four copies of the same `<a href="/help?c=…" target="_blank">`,
 * and all four shared the same defect: no `from`, so the guide's back link went
 * to /dashboard — not the screen you came from, let alone the console you were
 * standing in (Paul, 2026-09-13).
 *
 * It stays `target="_blank"`. A console holds work that is not saved anywhere —
 * the AI Generate console holds an unsaved prompt and plan — and navigating the
 * current tab away to read the documentation would discard it. The new tab
 * leaves the original untouched, so closing it is already a perfect return; the
 * `from` this now carries makes the guide's own back link land in the same
 * place for anyone who uses it instead.
 */
import { usePathname } from "next/navigation";
import { guideHref, type ReopenKey } from "@/app/lib/help/guideReturn";

export function ConsoleUserGuideLink({
  chapter, reopen, returnParams, className, style, title, children,
}: {
  /** Guide chapter slug, e.g. "simulation". */
  chapter: string;
  /** Which overlay the host should re-open when the reader comes back. */
  reopen: ReopenKey;
  /** Extra params the host needs to rebuild its state. */
  returnParams?: Record<string, string>;
  className?: string;
  /** For a console themed by a runtime colour, which cannot be a Tailwind class. */
  style?: React.CSSProperties;
  title?: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <a
      href={guideHref({ chapter, pathname: pathname || "/dashboard", reopen, returnParams })}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      title={title ?? "Open this feature's section of the User Guide"}
    >
      {children ?? "📖 User Guide"}
    </a>
  );
}
