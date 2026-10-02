/**
 * The "Commands popup: every line" set.
 *
 * Paul, 2026-09-26: "Construct a new set of generated commands for Voice
 * testing the goes through the Commands listed in the Commands popup to check
 * how well the commands are recognised. Add this set to the drop-down list of
 * seeds so that I can then investigate this set."
 *
 * BUILT FROM THE POPUP ITSELF (commandCatalog.ts), so a line added to the card
 * joins the set with no second edit — and a test fails if a line is ever left
 * out without a written reason (CATALOG_NOT_RECORDED).
 *
 * THE ANSWER KEY IS FROZEN, not computed. `catalogCorpus.expected.json` is what
 * each line parsed to when a person last reviewed it; a test fails the moment
 * any line starts parsing differently, so a grammar change that moves a popup
 * line is seen and judged rather than silently becoming the new truth. It lives
 * outside commandCatalog.ts because that file ships in the editor bundle.
 *
 * IDS COME FROM THE WORDS, not the position: `dgx-voice-catalog#<slug>`.
 * Inserting a line shifts no other case, so recorded clips keep their meaning;
 * a reworded line is a new case, and its old clips are simply no longer asked.
 *
 * Never imported by commandGenerator.ts (which must stay free of the grammar
 * and of this set).
 *
 * Pure.
 */
import { COMMAND_CATALOG } from "./commandCatalog";
import type { GeneratedCase } from "./commandGenerator";
import type { AssistOp } from "./ops";
import EXPECTED from "./catalogCorpus.expected.json";

export const CATALOG_SET_ID = "dgx-voice-catalog";

export interface CatalogLine {
  /** The popup section it sits under — the results table's family. */
  family: string;
  /** The item's "what it does". */
  does: string;
  /** The line itself, word for word as the popup shows it. */
  say: string;
}

/** Every distinct line of the popup, in the popup's order (voice words included). */
export function catalogLines(): CatalogLine[] {
  const seen = new Set<string>();
  const out: CatalogLine[] = [];
  for (const fam of COMMAND_CATALOG) {
    for (const item of fam.items) {
      for (const say of item.say) {
        if (seen.has(say)) continue;
        seen.add(say);
        out.push({ family: fam.family, does: item.does, say });
      }
    }
  }
  return out;
}

/** The popup's mic words (stop / yes / no …): items flagged `voice`. */
export function isVoiceWordLine(say: string): boolean {
  return COMMAND_CATALOG.some((f) => f.items.some((i) => i.voice && i.say.includes(say)));
}

/**
 * Lines listed in the popup but not recorded, each with its reason. The voice
 * words are left out as a group until the prod replay's mic-onset question is
 * settled: a one-word clip measures how fast the recorder wakes up more than
 * how well the product hears.
 */
export const VOICE_WORDS_REASON =
  "a one-word mic word: its clip measures the recorder's start-up more than the product — recorded once the mic-onset question from the 25 Sep prod replay is settled";
export const CATALOG_NOT_RECORDED: Readonly<Record<string, string>> = {};

/** Why a line is not in the set, or null when it is. */
export function notRecordedReason(say: string): string | null {
  return CATALOG_NOT_RECORDED[say] ?? (isVoiceWordLine(say) ? VOICE_WORDS_REASON : null);
}

/**
 * What a line needs to mean anything. `needsSelection` stands in for the mouse
 * (fixture ids); `parseOnly` says why only the parse can be judged — a ghost
 * suggestion, a risk library or a pointer the test diagram cannot supply — so
 * the line is never failed for what the harness cannot set up.
 */
export interface CatalogContext {
  needsSelection?: string[];
  parseOnly?: string;
}
const GHOST = "needs an NL Assist ghost suggestion on screen, which the test diagram cannot show";
const POINTER = "needs the mouse over the canvas — “here” and “under the cursor” are where it is";
const LIBRARY = "needs the project's Risk & Control library, which the test diagram does not have";
const NO_EP = "the test diagram has no expanded subprocess to dissolve — its one subprocess, Subprocess 3, is collapsed";
const NOTHING_LOOSE = "the test diagram has no element outside a pool, and a pool cannot hold another pool — so the app rightly refuses";
const NO_SUBLANES = "the test diagram has no sub-lanes — a sub-lane is born “Sub N” when one is added";
const GATEWAY_POINTS = "needs a selected gateway with flows on those points — none of the test diagram's three gateways has one on the points this line names";
/**
 * Selections are FIXTURE ids (commandFixture.ts, Paul's diagram): t1 Review
 * Claim, 95k4p9hz Check Claim, t4 Task 1, t5 Task 2, sub3 Subprocess 3,
 * kkc0tsyc Check Coverage, t6 Pay Claim, start Claim Received, g Claim
 * Approved? (flows out at its bottom and middle), p5fku96e Re-work Required?
 * (flows out at its top and middle), n6jhgOBCGw8pvIuvRqZvN the Send Rejection
 * Notification end event, cust Customer, sys Claims System.
 */
export const CATALOG_CONTEXT: Readonly<Record<string, CatalogContext>> = {
  // Add inside an expanded subprocess (Paul, 2026-10-02): with none selected or under the cursor these are ordinary adds.
  "add a task called Check Stock": { parseOnly: "needs an expanded subprocess selected or under the cursor — the test diagram has none, so on it this is an ordinary add" },
  "add a gateway called Stock OK": { parseOnly: "needs an expanded subprocess selected or under the cursor — the test diagram has none, so on it this is an ordinary add" },
  "add a subprocess called Inspect": { parseOnly: "needs an expanded subprocess selected or under the cursor — the test diagram has none, so on it this is an ordinary add" },
  "add a task called Pack inside Settle Claim": { parseOnly: "needs an expanded subprocess called Settle Claim — the test diagram has none, so on it the words are part of the name" },
  "set the usage to event": { needsSelection: ["sub3"] },
  "change the usage of this to call": { needsSelection: ["sub3"] },
  "reverse this": { parseOnly: "needs a connector selected — the test diagram's selection stand-in holds elements, not connectors" },
  "connect them": { parseOnly: "means the last two elements added this session — the test diagram has no history" },
  "move these right": { needsSelection: ["t4", "t5"] },
  "move the selected task two steps up": { needsSelection: ["t4"] },
  "nudge the selected task left": { needsSelection: ["t1"] },
  "nudge these down": { needsSelection: ["t4", "t5"] },
  "make this a user task": { needsSelection: ["t1"] },
  "turn the selected gateway into a parallel gateway": { needsSelection: ["g"] },
  // The label of the selected item (Paul, 2026-10-01): the gateway "Claim Approved?" stands in; the loop marker is on the subprocess.
  "move label up 20 pixels": { needsSelection: ["g"] },
  "move the label left": { needsSelection: ["g"] },
  "nudge the label down by 10": { needsSelection: ["g"] },
  "label this Approved": { needsSelection: ["g"] },
  "remove the label": { needsSelection: ["g"] },
  "remove the loop marker": { needsSelection: ["sub3"] },
  "make this a plain subprocess": { needsSelection: ["sub3"] },
  "make the selected event a timer event": { needsSelection: ["start"] },
  "rename the selected pool to Finance": { needsSelection: ["sys"] },
  "delete these": { needsSelection: ["t4", "t5"] },
  "connect this to Pay Claim": { needsSelection: ["t5"] },
  "move the selected task right": { needsSelection: ["t1"] },
  "add a boundary event called Timeout to this": { needsSelection: ["kkc0tsyc"] },
  "name these Receive, Check and Ship": { needsSelection: ["t4", "t5", "sub3"] },
  "label the selected tasks Draft and Review": { needsSelection: ["t4", "t5"] },
  "assign these to the Finance team": { needsSelection: ["t4", "t5"] },
  "put the selected tasks in the Sales team": { needsSelection: ["t1", "95k4p9hz"] },
  "attach risk R-012 to these": { parseOnly: LIBRARY },
  "attach control C-3 to the selected task": { parseOnly: LIBRARY },
  "put a task here": { parseOnly: POINTER },
  "add a gateway there": { parseOnly: POINTER },
  "rename the one under the cursor to Approve": { parseOnly: POINTER },
  "align these": { needsSelection: ["t4", "t5"] },
  "align these in a row": { needsSelection: ["t4", "t5"] },
  "line these up in a column": { needsSelection: ["t4", "t5"] },
  "align their left edges": { needsSelection: ["t4", "t5"] },
  "accept the suggestion": { parseOnly: GHOST },
  "take the gateway": { parseOnly: GHOST },
  "take the second one": { parseOnly: GHOST },
  "surround selected with an expanded subprocess called Check Stock": { needsSelection: ["t1"] },
  "wrap these in a subprocess": { needsSelection: ["t6"] },
  "put an expanded subprocess around the selected elements called Pick": { needsSelection: ["t1"] },
  "wrap these in a pool called Finance": { parseOnly: NOTHING_LOOSE },
  // The whole row: a lane round only some of a row would sweep the rest in, and it says so.
  "surround selected with a lane called Picking": { needsSelection: ["t4", "t5", "sub3", "kkc0tsyc", "g", "n6jhgOBCGw8pvIuvRqZvN"] },
  "put a pool around the selected elements called Sales": { parseOnly: NOTHING_LOOSE },
  "unwrap the selected subprocess": { parseOnly: NO_EP },
  "dissolve the EP": { parseOnly: NO_EP },
  "delete selected": { needsSelection: ["t5"] },
  "put a pool around everything": { parseOnly: NOTHING_LOOSE },
  "wrap everything in a pool": { parseOnly: NOTHING_LOOSE },
  "remove the sublane Sub 2": { parseOnly: NO_SUBLANES },
  "label selected Yes": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "label the selected connector Approved": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "label selected": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "add a message to the selected": { needsSelection: ["t4"] },
  "add a message from this": { needsSelection: ["t4"] },
  "swap top and bottom": { parseOnly: GATEWAY_POINTS },
  "swap bottom and middle": { needsSelection: ["g"] },
  "swap selected gateway, top and bottom": { parseOnly: GATEWAY_POINTS },
  "swap top with centre": { needsSelection: ["p5fku96e"] },
  "swap top and right": { needsSelection: ["p5fku96e"] },
  "move top to bottom": { needsSelection: ["p5fku96e"] },
  "move middle to top": { needsSelection: ["g"] },
  "move selected gateway, bottom to middle": { parseOnly: GATEWAY_POINTS },
  "move the selected event, right to bottom": { needsSelection: ["start"] },
  "move left to bottom": { needsSelection: ["end"] },
  "swap the selected pools": { needsSelection: ["cust", "sys"] },
  // A bare kind word with several of that kind ASKS (Paul, 2026-09-27) — the
  // test diagram has three gateways and three pools. Selected, it says which.
  "rename the gateway to Approved?": { needsSelection: ["g"] },
  "move the gateway two elements to the right": { needsSelection: ["p5fku96e"] },
  "add a lane to the pool": { needsSelection: ["p"] },
  // Naming no pool means "the pool" (refKinds.ts unsaidRef) — the same rule.
  "nudge pool down": { needsSelection: ["sys"] },
  "move the pool left boundary right": { needsSelection: ["sys"] },
  "convert selected to a task": { needsSelection: ["sub3"] },
  "move everything from selected two steps to the right": { needsSelection: ["t5"] },
};

/** `dgx-voice-catalog#<slug>` — from the words, so an inserted line moves nothing. */
export function catalogCaseId(say: string): string {
  const slug = say.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${CATALOG_SET_ID}#${slug}`;
}

/** The frozen answer for a line, or undefined when the key has no entry. */
export function expectedOpsFor(say: string): AssistOp[] | null | undefined {
  const key = EXPECTED as Record<string, AssistOp[] | null>;
  return say in key ? key[say] : undefined;
}

/** The set's cases, in popup order: every recorded line with its frozen answer and context. */
export function catalogCases(): GeneratedCase[] {
  return catalogLines()
    .filter((l) => notRecordedReason(l.say) === null)
    .map((l) => {
      const ctx = CATALOG_CONTEXT[l.say] ?? {};
      return {
        id: catalogCaseId(l.say),
        family: l.family,
        utterance: l.say,
        ops: expectedOpsFor(l.say) ?? [],
        refs: {},
        ...(ctx.needsSelection ? { needsSelection: ctx.needsSelection } : {}),
        ...(ctx.parseOnly ? { parseOnly: ctx.parseOnly } : {}),
      };
    });
}
