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
const GHOST = "needs an Assist ghost suggestion on screen, which the test diagram cannot show";
const POINTER = "needs the mouse over the canvas — “here” and “under the cursor” are where it is";
const NO_LABELLED_CONNECTOR = "the test diagram has no labelled connector or message to name";
const LIBRARY = "needs the project's Risk & Control library, which the test diagram does not have";
const EMPTY_EP = "the test diagram's only expanded subprocess is empty, and an empty one is refused";
const GATEWAY_POINTS = "needs a selected gateway with connectors on those points — the test diagram's gateways have one flow out, on the right";
/**
 * Selections are FIXTURE ids (commandFixture.ts): t1 Review Claim, t2 Check
 * Coverage, t3 Assess Risk, t4 Task 1, t5 Task 2, t6 Pay Claim, g Claim
 * Approved?, ep2 Expanded 2, pool3 Pool 3, cust Customer, sys Salesforce,
 * loose Reminder Sent (in no pool).
 */
export const CATALOG_CONTEXT: Readonly<Record<string, CatalogContext>> = {
  "connect them": { parseOnly: "means the last two elements added this session — the test diagram has no history" },
  "move these right": { needsSelection: ["t4", "t5"] },
  "move the selected task two steps up": { needsSelection: ["t4"] },
  "nudge the selected task left": { needsSelection: ["t2"] },
  "nudge these down": { needsSelection: ["t4", "t5"] },
  "make this a user task": { needsSelection: ["t1"] },
  "turn the selected gateway into a parallel gateway": { needsSelection: ["g"] },
  "make the selected event a timer event": { needsSelection: ["loose"] },
  "rename the selected pool to Finance": { needsSelection: ["pool3"] },
  "delete these": { needsSelection: ["t4", "t5"] },
  "connect this to Pay Claim": { needsSelection: ["t5"] },
  "move the selected task right": { needsSelection: ["t2"] },
  "add a boundary event called Timeout to this": { needsSelection: ["t3"] },
  "name these Receive, Check and Ship": { needsSelection: ["t4", "t5", "sub3"] },
  "label the selected tasks Draft and Review": { needsSelection: ["t4", "t5"] },
  "assign these to the Finance team": { needsSelection: ["t4", "t5"] },
  "put the selected tasks in the Sales team": { needsSelection: ["t1", "t2"] },
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
  "wrap these in a pool called Finance": { needsSelection: ["loose"] },
  // All four in the row: a lane round only some of a row would sweep the rest in, and it says so.
  "surround selected with a lane called Picking": { needsSelection: ["t4", "t5", "sub3", "g"] },
  "put a pool around the selected elements called Sales": { needsSelection: ["loose"] },
  "unwrap the selected subprocess": { parseOnly: EMPTY_EP },
  "dissolve the EP": { parseOnly: EMPTY_EP },
  "delete selected": { needsSelection: ["t5"] },
  "rename connector Email Details to Send Invoice": { parseOnly: NO_LABELLED_CONNECTOR },
  "delete connector Email Details": { parseOnly: NO_LABELLED_CONNECTOR },
  "remove message Email Details": { parseOnly: NO_LABELLED_CONNECTOR },
  "label selected Yes": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "label the selected connector Approved": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "label selected": { parseOnly: "needs a selected CONNECTOR — the harness can select elements only" },
  "label messages": { parseOnly: "the test diagram has no message flows to number" },
  "add a message to the selected": { needsSelection: ["t4"] },
  "add a message from this": { needsSelection: ["t4"] },
  "swap top and bottom": { parseOnly: GATEWAY_POINTS },
  "swap bottom and middle": { parseOnly: GATEWAY_POINTS },
  "swap selected gateway, top and bottom": { parseOnly: GATEWAY_POINTS },
  "swap top with centre": { parseOnly: GATEWAY_POINTS },
  "swap top and right": { parseOnly: GATEWAY_POINTS },
  "move top to bottom": { parseOnly: GATEWAY_POINTS },
  "move middle to top": { needsSelection: ["g"] },
  "move selected gateway, bottom to middle": { parseOnly: GATEWAY_POINTS },
  "swap the selected pools": { needsSelection: ["cust", "sys"] },
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
