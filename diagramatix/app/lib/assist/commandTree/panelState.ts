/**
 * What the Voice Assist Bubble Help panel shows right now — pure.
 *
 * Plan slice 3 (new features/voice-assist-bubble-help-plan-2026-10-01.md). The component
 * is a thin skin over this, because the project's tests are node-only: anything in a .tsx
 * cannot be reached, so everything that decides WHAT to show lives here.
 *
 * Inputs are what the editor already knows: the words heard so far in this utterance
 * (the interim caption), whether Assist ghost suggestions are on screen, and which
 * guided flow — if any — is open.
 */
import { formatNext } from "./format";
import { tokenise, type CommandTree } from "./tree";

export type OpenFlow =
  | { kind: "rename"; phase: "pick" | "name" }
  | { kind: "dividers" }
  /** A guided flow the tree has no sub-grammar for (numbered pick, message pick, template pick). */
  | { kind: "other"; label: string };

export interface PanelInput {
  /** The words heard so far in the current utterance ("" when nothing has been said). */
  interim: string;
  /** Assist ghost suggestions are showing — the Assist-only words count. */
  ghost: boolean;
  flow: OpenFlow | null;
}

export type PanelMode =
  /** Nothing said yet: the first words of every command. */
  | "first"
  /** Some words said: what can come next. */
  | "next"
  /** A guided flow is open: its own words. */
  | "flow"
  /** A guided flow with no sub-grammar: a plain hint. */
  | "other-flow"
  /** The words match no command: the first words again, so the speaker can start over. */
  | "no-match";

export interface PanelView {
  mode: PanelMode;
  /** The words heard, tidied (shown after "Heard:"). */
  heard: string;
  /** The next words, written as the bubble writes them: required first, then [optional]. */
  lines: string[];
  /** What was heard is already a whole command — it could stop here. */
  complete: boolean;
  /** The variable currently taking words, if one is open. */
  openSlot: string | null;
  /** A sentence for the panel to show above the list, or null. */
  note: string | null;
}

const FLOW_ID = (f: Extract<OpenFlow, { kind: "rename" | "dividers" }>): string =>
  f.kind === "dividers" ? "dividers" : f.phase === "pick" ? "rename-pick" : "rename-name";

export function computePanel(tree: CommandTree, input: PanelInput): PanelView {
  const tokens = tokenise(input.interim);
  const heard = tokens.join(" ");

  if (input.flow) {
    if (input.flow.kind !== "other" && tree.sections[`flow ${FLOW_ID(input.flow)}`]) {
      const r = tree.next(tokens, { flow: FLOW_ID(input.flow) });
      const lines = r.ok ? formatNext(r.next) : formatNext(tree.firstWords({ flow: FLOW_ID(input.flow) }));
      return {
        mode: "flow", heard, lines, complete: r.ok && r.complete, openSlot: r.openSlot,
        note: input.flow.kind === "dividers" ? "Move dividers is open." : input.flow.phase === "pick" ? "Pick one by its number." : "Say the new name.",
      };
    }
    const label = input.flow.kind === "other" ? input.flow.label : "guided pick";
    return { mode: "other-flow", heard, lines: ["<number>", "cancel"], complete: false, openSlot: null, note: `A ${label} is open — say its number, or cancel.` };
  }

  const ctx = { ghost: input.ghost };
  if (!tokens.length) {
    return { mode: "first", heard, lines: formatNext(tree.firstWords(ctx)), complete: false, openSlot: null, note: null };
  }
  const r = tree.next(tokens, ctx);
  if (!r.ok) {
    return { mode: "no-match", heard, lines: formatNext(tree.firstWords(ctx)), complete: false, openSlot: null, note: "No command starts like that — the first words are:" };
  }
  return { mode: "next", heard, lines: formatNext(r.next), complete: r.complete, openSlot: r.openSlot, note: null };
}
