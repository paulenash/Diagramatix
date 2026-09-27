/**
 * The "New commands: dividers, convert, contents (50)" set.
 *
 * Paul, 2026-09-27: "Construct a set of 50 voice commands covering the new
 * commands added to 1. move lane dividers, convert, Move lane contents and put
 * them in Voice Assist Test for me to explore these new commands and their
 * reliability."
 *
 * Three commands shipped that day, and this set asks each of them the way a
 * person would: a lane's top or bottom boundary / divider (`movePoolBoundary`,
 * poolBoundaryPhrase.ts → laneBoundary.ts), a task ↔ subprocess shape change
 * (`convertActivity`), and "move everything in / from …" (`moveContents`,
 * moveContents.ts).
 *
 * THE ANSWER KEY IS WRITTEN BY HAND. Every case carries the ops the sentence
 * ought to produce, typed out here — never taken from the parser's own output,
 * and this module never imports the grammar (a test holds it to that). So a
 * parser mistake shows up as a red row rather than becoming the truth, which
 * is the difference from the popup set's frozen key.
 *
 * ALL ON THE TEST DIAGRAM (commandFixture.ts): pool Claims Processing with
 * lanes Lane 3 (L1, top), Underwriters (L2) and Lane 2 (L3, bottom); black-box
 * pools Customer above and Claims System below. The distances are chosen from
 * its geometry, so every move that should work has room:
 *   • the Lane 3 / Underwriters divider can go up 115px and down 43px;
 *   • the Underwriters / Lane 2 divider can go up 157px and down 19px (Pay
 *     Claim sits 19.998px below it — so even the default 20px step is refused);
 *   • the room on the left for contents: Lane 3 37px, Underwriters 113px,
 *     Lane 2 1108px, the whole pool 37px; from Task 2 on, 47px (Task 1 is in
 *     the way); from Check Claim on, 162px.
 *
 * WHAT MUST BE REFUSED. A divider through a task and a move left with no room
 * are refused on purpose, with the room said. The L4 scorer counts ANY refusal
 * as a red row (applyScore.ts), so those cases are scored on their parse here
 * — with the answer the app must give written into the reason — and the
 * refusal itself is pinned by tests/dictation/voice-new-commands-set.test.ts.
 *
 * IDS COME FROM THE WORDS (`dgx-voice-new-commands-2026-09-27#<slug>`), as the
 * popup set's do: a clip keeps its meaning when a case is inserted, and a
 * reworded case is a new one.
 *
 * Pure.
 */
import type { GeneratedCase } from "./commandGenerator";
import type { AssistOp } from "./ops";

export const NEW_COMMANDS_SET_ID = "dgx-voice-new-commands-2026-09-27";

export const DIVIDERS = "Lane dividers";
export const CONVERT = "Convert task / subprocess";
export const CONTENTS = "Move lane contents";

export interface NewCommandCase {
  family: typeof DIVIDERS | typeof CONVERT | typeof CONTENTS;
  /** Word for word what is read aloud. */
  say: string;
  /** The answer key, by hand. Ref fields hold the SPOKEN name, as the grammar emits them. */
  ops: AssistOp[];
  /** Fixture ids standing in for the mouse. */
  needsSelection?: string[];
  /**
   * The app must REFUSE this, and its answer must contain these words. Such a
   * case is scored on its parse only (see the header).
   */
  refuses?: string;
  /** Only the parse can be judged, for a reason other than a refusal. */
  parseOnly?: string;
}

const NO_SUBLANES = "the test diagram has no sub-lanes — a sub-lane is born “Sub N” when one is added — so only the parse can be judged";

/** Why a must-refuse case is scored on its parse, with the answer the app must give. */
export function refusalReason(refuses: string): string {
  return `must be REFUSED — the app should answer “${refuses}…”. Every refusal is a red row to the scorer, `
    + "so only the parse is judged here; the refusal itself is pinned by voice-new-commands-set.test.ts";
}

// Shorthand for the three op shapes — each still spelled out in full below.
const boundary = (ref: string | undefined, b: "top" | "bottom", direction: "up" | "down", distance?: number): AssistOp =>
  ({ op: "movePoolBoundary", ...(ref ? { ref } : {}), boundary: b, direction, ...(distance !== undefined ? { distance } : {}) });
const convert = (ref: string, to: "task" | "subprocess"): AssistOp => ({ op: "convertActivity", ref, to });
const contents = (
  where: { ref?: string; fromRef?: string }, direction: "left" | "right", amount: { steps?: number; pixels?: number } = {},
): AssistOp => ({ op: "moveContents", ...where, direction, ...amount });

/**
 * The fifty, in the order they are read. Selections are FIXTURE ids: L2
 * Underwriters, t4 Task 1, t5 Task 2, sub3 Subprocess 3, kkc0tsyc Check
 * Coverage.
 */
export const NEW_COMMAND_CASES: readonly NewCommandCase[] = [
  // ── 1. Lane dividers (20) ───────────────────────────────────────────────
  // A lane's top or bottom boundary is the divider it shares with the lane
  // next to it; at the end of the stack it is the pool's own edge.
  { family: DIVIDERS, say: "move Underwriters top boundary up 40 pixels", ops: [boundary("Underwriters", "top", "up", 40)] },
  { family: DIVIDERS, say: "move the upper boundary of Underwriters up by forty", ops: [boundary("Underwriters", "top", "up", 40)] },
  { family: DIVIDERS, say: "move Underwriters lower divider up one fifty", ops: [boundary("Underwriters", "bottom", "up", 150)] },
  { family: DIVIDERS, say: "move Underwriters top boundary up one hundred", ops: [boundary("Underwriters", "top", "up", 100)] },
  { family: DIVIDERS, say: "move the bottom divider of Lane 3 down by 40", ops: [boundary("Lane 3", "bottom", "down", 40)] },
  { family: DIVIDERS, say: "move Underwriters top boundary down two steps", ops: [boundary("Underwriters", "top", "down", 40)] },
  { family: DIVIDERS, say: "move Underwriters top boundary up a task", ops: [boundary("Underwriters", "top", "up", 64)] },
  // "boundary" alone, with a name: the edge the move heads for.
  { family: DIVIDERS, say: "move the Underwriters boundary up half a task", ops: [boundary("Underwriters", "top", "up", 32)] },
  // The recogniser's "two tasks" — two Task heights.
  { family: DIVIDERS, say: "move Underwriters bottom boundary up to tasks", ops: [boundary("Underwriters", "bottom", "up", 128)] },
  // The lane's own number is a name, never a distance.
  { family: DIVIDERS, say: "move Lane 2 top boundary up 60", ops: [boundary("Lane 2", "top", "up", 60)] },
  // The top lane's top and the bottom lane's bottom are the pool's edges.
  { family: DIVIDERS, say: "move the top boundary of Lane 3 up", ops: [boundary("Lane 3", "top", "up")] },
  { family: DIVIDERS, say: "move Lane 2 bottom boundary down by 40", ops: [boundary("Lane 2", "bottom", "down", 40)] },
  // No name: the selected lane's.
  { family: DIVIDERS, say: "top boundary up by 30", ops: [boundary(undefined, "top", "up", 30)], needsSelection: ["L2"] },
  { family: DIVIDERS, say: "move the divider up", ops: [boundary(undefined, "top", "up")], needsSelection: ["L2"] },
  { family: DIVIDERS, say: "move the boundary down a bit", ops: [boundary(undefined, "bottom", "down", 10)], needsSelection: ["L2"] },
  { family: DIVIDERS, say: "move selected Underwriters bottom boundary up one hundred", ops: [boundary("selected Underwriters", "bottom", "up", 100)], needsSelection: ["L2"] },
  // "line" is how the recogniser often writes "lane".
  { family: DIVIDERS, say: "move underwriters line top boundary up by sixty", ops: [boundary("underwriters", "top", "up", 60)] },
  // Refused: never through anything — and it says how far it can go.
  {
    family: DIVIDERS, say: "move Underwriters top boundary down by 50", ops: [boundary("Underwriters", "top", "down", 50)],
    // Subprocess 3 only TOUCHES the line at 50px down — touching is not crossing (2026-09-27).
    refuses: "the divider would run through “Task 2”, “Check Coverage” — it can move down at most 43px",
  },
  // The plain step: Pay Claim sits 19.998px under this divider, which refused it
  // until touching stopped counting as crossing (2026-09-27) — now it moves.
  { family: DIVIDERS, say: "move Underwriters bottom boundary down", ops: [boundary("Underwriters", "bottom", "down")] },
  {
    family: DIVIDERS, say: "move Underwriters top boundary up by three tasks", ops: [boundary("Underwriters", "top", "up", 192)],
    refuses: "it can move up at most 115px",
  },

  // ── 2. Convert a task ↔ a subprocess (12) ───────────────────────────────
  { family: CONVERT, say: "convert Review Claim to a subprocess", ops: [convert("Review Claim", "subprocess")] },
  { family: CONVERT, say: "convert Subprocess 3 to a task", ops: [convert("Subprocess 3", "task")] },
  { family: CONVERT, say: "change Task 1 to a sub process", ops: [convert("Task 1", "subprocess")] },
  { family: CONVERT, say: "convert selected to a subprocess", ops: [convert("selected", "subprocess")], needsSelection: ["t5"] },
  { family: CONVERT, say: "make this a task", ops: [convert("this", "task")], needsSelection: ["sub3"] },
  { family: CONVERT, say: "turn the selected task into a subprocess", ops: [convert("the selected task", "subprocess")], needsSelection: ["kkc0tsyc"] },
  { family: CONVERT, say: "convert these to a subprocess", ops: [convert("these", "subprocess")], needsSelection: ["t4", "t5"] },
  // "sub process" as the recogniser writes it.
  { family: CONVERT, say: "convert Check Claim to a Processing", ops: [convert("Check Claim", "subprocess")] },
  // "convert" as the recogniser really heard it, with Check Coverage on the diagram (repairConvertWord).
  { family: CONVERT, say: "Pass Check claim to a subprocess", ops: [convert("Check claim", "subprocess")] },
  { family: CONVERT, say: "Coverage selected to a subprocess", ops: [convert("selected", "subprocess")], needsSelection: ["t4"] },
  // Refused: already that shape (Paul's own heard line), and not an activity.
  {
    family: CONVERT, say: "Coverage check claim to a task", ops: [convert("check claim", "task")],
    refuses: "Check Claim is already a task",
  },
  {
    family: CONVERT, say: "convert Claim Approved to a subprocess", ops: [convert("Claim Approved", "subprocess")],
    refuses: "Claim Approved? is a gateway — only a task becomes a subprocess",
  },

  // ── 3. Move lane contents (18) ──────────────────────────────────────────
  { family: CONTENTS, say: "move everything in Underwriters two steps to the right", ops: [contents({ ref: "Underwriters" }, "right", { steps: 2 })] },
  { family: CONTENTS, say: "move everything in Lane 2 three steps to the left", ops: [contents({ ref: "Lane 2" }, "left", { steps: 3 })] },
  { family: CONTENTS, say: "move all the elements in Lane 3 100 pixels to the right", ops: [contents({ ref: "Lane 3" }, "right", { pixels: 100 })] },
  { family: CONTENTS, say: "shift everything inside Underwriters left 1 step", ops: [contents({ ref: "Underwriters" }, "left", { steps: 1 })] },
  { family: CONTENTS, say: "move everything in the Underwriters lane to the right by 150 pixels", ops: [contents({ ref: "the Underwriters lane" }, "right", { pixels: 150 })] },
  // No amount: one step.
  { family: CONTENTS, say: "move everything in Claims Processing right", ops: [contents({ ref: "Claims Processing" }, "right")] },
  // Past the pool's right edge: every pool widens first.
  { family: CONTENTS, say: "move the contents of Lane 2 four steps to the right", ops: [contents({ ref: "Lane 2" }, "right", { steps: 4 })] },
  { family: CONTENTS, say: "slide everything within Lane 3 20 pixels to the left", ops: [contents({ ref: "Lane 3" }, "left", { pixels: 20 })] },
  { family: CONTENTS, say: "move everything in the selected lane one step to the right", ops: [contents({ ref: "the selected lane" }, "right", { steps: 1 })], needsSelection: ["L2"] },
  // From a step on: that step and everything after it, in its own lane unless one is named.
  { family: CONTENTS, say: "move everything from selected two steps to the right", ops: [contents({ fromRef: "selected" }, "right", { steps: 2 })], needsSelection: ["t5"] },
  { family: CONTENTS, say: "move everything after Check Claim 50 pixels to the left", ops: [contents({ fromRef: "Check Claim" }, "left", { pixels: 50 })] },
  { family: CONTENTS, say: "move Check Coverage and everything after it two steps right", ops: [contents({ fromRef: "Check Coverage" }, "right", { steps: 2 })] },
  { family: CONTENTS, say: "move everything starting at Task 2 in Claims Processing one step to the right", ops: [contents({ fromRef: "Task 2", ref: "Claims Processing" }, "right", { steps: 1 })] },
  { family: CONTENTS, say: "move everything from selected, in Underwriters, 100 pixels to the right", ops: [contents({ fromRef: "selected", ref: "Underwriters" }, "right", { pixels: 100 })], needsSelection: ["sub3"] },
  // Refused: nothing may cross into a header or run into what stays.
  {
    family: CONTENTS, say: "move everything in Underwriters two steps to the left", ops: [contents({ ref: "Underwriters" }, "left", { steps: 2 })],
    refuses: "only 113px of room on the left in Underwriters",
  },
  {
    family: CONTENTS, say: "move the selected task and everything after it 50 pixels to the left", ops: [contents({ fromRef: "the selected task" }, "left", { pixels: 50 })],
    needsSelection: ["t5"], refuses: "only 47px of room on the left of Task 2",
  },
  {
    family: CONTENTS, say: "move everything in Claims Processing one step to the left", ops: [contents({ ref: "Claims Processing" }, "left", { steps: 1 })],
    refuses: "only 37px of room on the left in Claims Processing",
  },
  { family: CONTENTS, say: "move everything in sub-lane Sub 1 one step to the right", ops: [contents({ ref: "sub-lane Sub 1" }, "right", { steps: 1 })], parseOnly: NO_SUBLANES },
];

/** `dgx-voice-new-commands-2026-09-27#<slug>` — from the words, so an inserted case moves nothing. */
export function newCommandCaseId(say: string): string {
  const slug = say.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${NEW_COMMANDS_SET_ID}#${slug}`;
}

/** The set's cases, in reading order, each with its hand-written answer and context. */
export function newCommandCases(): GeneratedCase[] {
  return NEW_COMMAND_CASES.map((c) => {
    const parseOnly = c.refuses ? refusalReason(c.refuses) : c.parseOnly;
    return {
      id: newCommandCaseId(c.say),
      family: c.family,
      utterance: c.say,
      ops: structuredClone(c.ops),
      refs: {},
      ...(c.needsSelection ? { needsSelection: [...c.needsSelection] } : {}),
      ...(parseOnly ? { parseOnly } : {}),
    };
  });
}
