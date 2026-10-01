/**
 * Voice Assist Help — the command tree (plan slices 1–2).
 * new features/voice-assist-help-plan-2026-10-01.md
 */
export { parsePattern, parseSections } from "./notation";
export type { Node, Pattern, NotationError, Sections } from "./notation";
export { DEFAULT_CONVENTIONS, slotDefOf } from "./conventions";
export type { Conventions, SlotDef, SlotKind } from "./conventions";
export { validateConventions } from "./validate";
export { DEFAULT_LISTS, DEFAULT_PATTERNS } from "./defaults";
export { CommandTree, compileTree, tokenise } from "./tree";
export type { Lists, NextItem, NextResult, WalkContext } from "./tree";
export { formatItem, formatNext } from "./format";
export { resolveAssistHelp, isDefaultPatterns, isDefaultConventions } from "./resolve";
export type { AssistHelpConfig } from "./resolve";

import { DEFAULT_CONVENTIONS } from "./conventions";
import { DEFAULT_LISTS, DEFAULT_PATTERNS } from "./defaults";
import { compileTree, type CommandTree } from "./tree";

let shipped: CommandTree | null = null;

/** The tree as shipped (code defaults). Cached — it is immutable. */
export function defaultCommandTree(): CommandTree {
  return (shipped ??= compileTree(DEFAULT_PATTERNS, DEFAULT_CONVENTIONS, DEFAULT_LISTS));
}

export { computePanel } from "./panelState";
export type { OpenFlow, PanelInput, PanelMode, PanelView } from "./panelState";
export { targetNow } from "./targetNow";
export type { TargetKind, TargetNow } from "./targetNow";
export { namesOf, nameFits } from "./names";
export type { DiagramNames } from "./names";
export { consistencyReport, isMeaningless, DEFAULT_SAMPLE_FILL } from "./consistencyReport";
export type { ConsistencyReport, ConsistencyInput, ReportLine } from "./consistencyReport";
