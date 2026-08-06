/**
 * Rich-text dictation command grammar. A small catalogue of spoken phrases that
 * map to a formatting ACTION, used by the RichTextEditor mic. Positional
 * commands ("add a point after 3", "delete point 3") carry a `{n}` placeholder
 * and yield a number. The defaults here seed the admin-editable DictationCommand
 * catalogue; the editor fetches the live catalogue and falls back to these.
 */

export type DictationAction =
  | "newLine" | "newParagraph"
  | "numberedList" | "bulletList" | "nextPoint"
  | "bold" | "italic" | "underline"
  | "deleteWord" | "stop"
  | "addPointAfter" | "deletePoint";

export interface DictationCommandDef {
  action: DictationAction;
  phrases: string[];
  /** Phrases contain a `{n}` number placeholder (e.g. "delete point {n}"). */
  positional?: boolean;
}

/** Human labels for the admin editor. */
export const DICTATION_ACTION_LABELS: Record<DictationAction, string> = {
  newLine: "New line",
  newParagraph: "New paragraph",
  numberedList: "Start numbered list",
  bulletList: "Start bullet list",
  nextPoint: "New list item",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  deleteWord: "Delete last word",
  stop: "Stop dictation",
  addPointAfter: "Add a point after N (positional)",
  deletePoint: "Delete point N (positional)",
};

export const POSITIONAL_ACTIONS: ReadonlySet<DictationAction> = new Set(["addPointAfter", "deletePoint"]);

export const DEFAULT_DICTATION_COMMANDS: DictationCommandDef[] = [
  { action: "newLine", phrases: ["new line", "next line", "line break"] },
  { action: "newParagraph", phrases: ["new paragraph"] },
  { action: "numberedList", phrases: ["numbered list", "start a numbered list", "start numbered list", "ordered list"] },
  { action: "bulletList", phrases: ["bullet list", "bullet points", "start a bullet list", "bulleted list"] },
  { action: "nextPoint", phrases: ["next point", "new point", "new item", "next item", "new bullet", "next bullet", "new number"] },
  { action: "bold", phrases: ["bold"] },
  { action: "italic", phrases: ["italic"] },
  { action: "underline", phrases: ["underline"] },
  { action: "deleteWord", phrases: ["delete", "delete that", "scratch that", "delete last word"] },
  { action: "stop", phrases: ["stop", "stop dictation", "done"] },
  { action: "addPointAfter", phrases: ["add a point after {n}", "add point after {n}", "insert point after {n}", "new point after {n}"], positional: true },
  { action: "deletePoint", phrases: ["delete point {n}", "remove point {n}", "delete item {n}", "delete number {n}"], positional: true },
];

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

/** Parse a spoken number — a digit ("3") or a word ("three"). */
export function parseSpokenNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^\d+$/.test(t)) { const n = parseInt(t, 10); return n > 0 ? n : null; }
  return NUM_WORDS[t] ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match a spoken utterance against the command catalogue. Returns the action
 *  (and a number for positional commands), or null to dictate it as text. */
export function matchDictationCommand(
  utterance: string,
  defs: DictationCommandDef[] = DEFAULT_DICTATION_COMMANDS,
): { action: DictationAction; n?: number } | null {
  const norm = utterance.toLowerCase().trim().replace(/[.,!?;:]+$/, "");
  if (!norm) return null;
  for (const def of defs) {
    if (def.positional || POSITIONAL_ACTIONS.has(def.action)) {
      for (const tmpl of def.phrases) {
        const parts = tmpl.toLowerCase().split("{n}").map(escapeRe);
        if (parts.length < 2) continue;
        const re = new RegExp("^" + parts.join("(\\w+)") + "$");
        const m = norm.match(re);
        if (m) {
          const n = parseSpokenNumber(m[1]);
          if (n) return { action: def.action, n };
        }
      }
    } else if (def.phrases.some((p) => p.toLowerCase().trim() === norm)) {
      return { action: def.action };
    }
  }
  return null;
}
