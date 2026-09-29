/**
 * The browser side of "the subscription stopped you": turn a 403 into a notice
 * the person can read, instead of a silent return, a generic "Failed to …", or
 * raw JSON in an alert().
 *
 *   const res = await fetch("/api/projects", { method: "POST", … });
 *   if (!res.ok) { if (await showGateNotice(res)) return; … the caller's own handling … }
 *
 * `showGateNotice` puts the notice on the page (GateNoticeHost listens for the
 * event) and says whether it was one; the caller keeps its own handling for
 * everything that is not a gate.
 */
import { noticeFromBody, type GateNotice } from "./messages";

export const GATE_NOTICE_EVENT = "dgx:gate-notice";

/** Show a notice directly (for callers that already have the body). */
export function announceNotice(notice: GateNotice): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GateNotice>(GATE_NOTICE_EVENT, { detail: notice }));
}

/** True when the response was a subscription / policy refusal and it has been shown. Never throws. */
export async function showGateNotice(res: Response): Promise<boolean> {
  try {
    if (res.status !== 403) return false;
    const notice = noticeFromBody(await res.clone().json().catch(() => null));
    if (!notice) return false;
    announceNotice(notice);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a file the server generates. A gate refusal is shown as a notice rather than the browser
 * landing on a page of JSON (it used to: a plain link to the export URL). Returns whether it downloaded.
 */
export async function downloadWithNotice(url: string, filename: string, init?: RequestInit): Promise<boolean> {
  const res = await fetch(url, init);
  if (!res.ok) {
    if (await showGateNotice(res)) return false;
    const text = await res.text().catch(() => "");
    announceNotice({ kind: "policy", title: "Download failed", detail: text.slice(0, 200) || `The server answered ${res.status}.`, upgradeHref: null, upgradeLabel: null });
    return false;
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return true;
}
