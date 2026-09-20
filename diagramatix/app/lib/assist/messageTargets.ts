/**
 * "Add a message" by number.
 *
 * Paul, 2026-09-15: a bare "add message" should number every message source or
 * target and wait for "n to m labelled <text>"; "add message to selected"
 * should number the valid counterparts of the selection — black-box pools when
 * a task or collapsed subprocess is selected, tasks and collapsed subprocesses
 * when a black-box pool is selected — and wait for "to/from n labelled <text>".
 *
 * Pure: the editor draws the badges and applies the resulting addMessage op.
 */
import type { DiagramElement } from "../diagram/types";
import { numberTargets, type RenameTarget } from "./renameTargets";
import { isBlackBoxPool } from "../diagram/blackBoxPoolMenu";

const ACTIVITY_TYPES = new Set<string>(["task", "subprocess", "subprocess-collapsed"]);
export const isMessageActivity = (e: DiagramElement) => ACTIVITY_TYPES.has(e.type);
// One definition of "black-box pool", shared with the canvas right-click menu.
export { isBlackBoxPool };

export type MessagePick =
  | { mode: "pair"; targets: RenameTarget[] }
  | { mode: "one"; targets: RenameTarget[]; anchorId: string; anchorIsPool: boolean };

/** Number candidates in reading order — the shared rule, so the same element
 *  carries the same number whichever flow is asking. */
const numbered = numberTargets;

/**
 * The badges to draw. `anchorId` = the selected element for "add message to
 * selected"; null/undefined = the bare form. Returns an error string when there
 * is nothing sensible to number.
 */
export function collectMessageTargets(elements: readonly DiagramElement[], anchorId?: string | null): MessagePick | { error: string } {
  const els = elements as DiagramElement[];
  if (anchorId) {
    const a = els.find((e) => e.id === anchorId);
    if (!a) return { error: "nothing is selected" };
    if (isMessageActivity(a)) {
      const pools = els.filter(isBlackBoxPool);
      if (!pools.length) return { error: "there is no black-box pool to message" };
      return { mode: "one", targets: numbered(pools), anchorId, anchorIsPool: false };
    }
    if (isBlackBoxPool(a)) {
      const acts = els.filter(isMessageActivity);
      if (!acts.length) return { error: "there is no task or collapsed subprocess to message" };
      return { mode: "one", targets: numbered(acts), anchorId, anchorIsPool: true };
    }
    return { error: `messages run between a task or collapsed subprocess and a black-box pool — “${a.label?.trim() || a.type}” is neither` };
  }
  const all = els.filter((e) => isMessageActivity(e) || isBlackBoxPool(e));
  if (all.length < 2) return { error: "a message needs a task or collapsed subprocess and a black-box pool" };
  return { mode: "pair", targets: numbered(all) };
}

const NUM: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20" };
const numNorm = (s: string) => s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (m) => NUM[m]);
const LABEL = `(?:\\s*,?\\s+(?:labell?ed|called|named|saying|with label|with the label|that says)\\s+(.+))?`;

export type MessageAnswer =
  | { kind: "pair"; from: number; to: number; label?: string }
  | { kind: "one"; dir: "to" | "from"; n: number; label?: string }
  | null;

/** "3 to 7 labelled Order Placed" · "from 3 to 7" · "to 2 labelled X" · "from 2, called Y". */
export function parseMessageAnswer(utterance: string, mode: "pair" | "one"): MessageAnswer {
  const s = numNorm(utterance.trim().toLowerCase().replace(/[.!?;:]+$/g, ""));
  if (mode === "pair") {
    const m = s.match(new RegExp(`^(?:from\\s+)?(?:number\\s+)?(\\d+)\\s+to\\s+(?:number\\s+)?(\\d+)${LABEL}$`));
    if (!m) return null;
    return { kind: "pair", from: parseInt(m[1], 10), to: parseInt(m[2], 10), ...(m[3] ? { label: m[3].trim() } : {}) };
  }
  const m = s.match(new RegExp(`^(to|from)\\s+(?:number\\s+)?(\\d+)${LABEL}$`));
  if (!m) return null;
  return { kind: "one", dir: m[1] as "to" | "from", n: parseInt(m[2], 10), ...(m[3] ? { label: m[3].trim() } : {}) };
}
