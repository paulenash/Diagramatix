/**
 * T4781-T4790 — "and message" / "Handle message" are "add message", and a
 * boundary event is never a task (Block 2 Test 3, 25 September 2026).
 *
 * Paul's log, verbatim:
 *
 *   "and message"     → didn't understand that     Paul: "Should recognise 'Add'"
 *   "Handle message"  → didn't understand that     Paul: "Should recognise 'Add'"
 *
 * Every grammar rule is anchored on a real verb, so a misheard "add" reached
 * nothing, and the AI fallback failed as well. Paul's decisions:
 *   - "and" is read as "add" in front of an add; "handle" only in the bare
 *     message command. NOT "at" — it starts real place phrases.
 *   - a boundary event with no host goes on the selected task or subprocess
 *     ("Use the selected task"), and otherwise is refused with what to say.
 *     Never a task, never a loose event.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { repairAddWord, repairHeardWords, MISHEARD_ADD_BARE_WORDS, MISHEARD_ADD_LEADING_WORDS } from "@/app/lib/assist/selectedWord";
import { containsAnotherCommand, startsWithCommandVerb, hasCommandAfterName, COMMAND_VERBS, CONVERT_VERBS } from "@/app/lib/assist/commandVerbs";
import { parseBoundaryEventPhrase } from "@/app/lib/assist/boundaryEventPhrase";
import { POOL_WORDS, LANE_WORDS, SUBLANE_WORDS, PARTICIPANT_WORDS, BOX_WORDS, MESSAGE_WORDS } from "@/app/lib/assist/containerWords";
import { SYMBOL_PHRASES } from "@/app/lib/assist/ops";
import { EVENT_OPTS } from "@/app/lib/diagram/elementSubtypes";
import { BOUNDARY_HOST_TYPES, isBoundaryHost } from "@/app/lib/diagram/boundaryHosts";
import { generateCases } from "@/app/lib/assist/commandGenerator";
import { fixtureDiagram, fixtureElements } from "@/app/lib/assist/commandFixture";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import type { AssistOp } from "@/app/lib/assist/ops";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
/** Source with comments removed — the wiring is in the code, not the prose about it. */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const SEEDS = [DEFAULT_CORPUS_SEED, "issue3-a", "issue3-b", "issue3-c", "issue3-d"];

/** Every clean sentence the harness knows: generated corpus plus the catalogue. */
function cleanCorpus(): string[] {
  const out = new Set<string>();
  for (const seed of SEEDS) {
    for (const c of generateCases({ seed, count: 300, world: fixtureElements() })) out.add(c.utterance);
  }
  for (const fam of [...COMMAND_CATALOG, ...SUPERADMIN_COMMAND_CATALOG]) {
    for (const item of fam.items) for (const s of item.say) out.add(s);
  }
  return [...out];
}

/** Clean "add a|an <…>" / "add message …" sentences, and the same said with "and". */
function misheardPairs(): Array<{ clean: string; heard: string }> {
  return cleanCorpus()
    .filter((s) => /^add\s+(?:(?:a|an)\s+|message\b)/i.test(s))
    .map((clean) => ({ clean, heard: clean.replace(/^add\b/i, (w) => (w[0] === "A" ? "And" : "and")) }));
}

/** Say it on the fixture, headless, with this selection. */
function say(sentence: string, selectedIds: string[] = []) {
  const h = headlessDiagram(fixtureDiagram());
  const before = new Set(h.data.elements.map((e) => e.id));
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds }));
  const added = h.data.elements.filter((e) => !before.has(e.id));
  return { ...r, ops: ops!, added, screen: h.screen, after: h.data };
}

describe("T4781 — Paul's two utterances open the numbered message picker", () => {
  it("reads “and message” and “Handle message” as “add message”", () => {
    expect(parseCommand("and message")).toEqual([{ op: "addMessageByNumber" }]);
    expect(parseCommand("Handle message")).toEqual([{ op: "addMessageByNumber" }]);
  });

  it("does on the diagram what the clean phrase does", () => {
    for (const said of ["and message", "Handle message", "add message"]) {
      const r = say(said);
      expect(r.screen, said).toEqual(["message"]);
      expect(r.added, `${said} must add nothing — it only numbers the candidates`).toEqual([]);
    }
  });

  it("takes the punctuation and the article the recogniser adds", () => {
    for (const said of ["Handle message.", "And message,", "and a message", "and a message flow", "handle a message", "And, message"]) {
      expect(parseCommand(said), said).toEqual([{ op: "addMessageByNumber" }]);
    }
  });

  it("is EXACTLY the shape Paul was heard to say — no “the”, no plural", () => {
    // "delete the gateway … and the message" is a conjunction. Folding it would
    // open the picker, which captures the next utterances until "done".
    for (const said of ["and the message", "and messages", "handle messages", "handle the message", "And the messages."]) {
      expect(repairHeardWords(said), said).toBe(said);
      expect(parseCommand(said), said).toBeNull();
    }
  });

  it("leaves a message's own NAME alone — the bare fold is anchored at both ends", () => {
    for (const said of ["Handle Message 1", "handle message 2", "handle message one", "handle", "and", "at"]) {
      expect(repairHeardWords(said), said).toBe(said);
    }
    expect(parseCommand("connect Handle Message 1 to Customer"))
      .toEqual([{ op: "connect", fromRef: "Handle Message 1", toRef: "Customer" }]);
    expect(parseCommand("rename Handle Message 1 to Handle Order"))
      .toEqual([{ op: "rename", ref: "Handle Message 1", label: "Handle Order" }]);
  });

  it("folds only the words Paul approved", () => {
    expect([...MISHEARD_ADD_BARE_WORDS]).toEqual(["and", "handle"]);
    expect([...MISHEARD_ADD_LEADING_WORDS]).toEqual(["and"]);
    for (const said of ["at message", "had message", "at a message", "end message"]) {
      expect(parseCommand(said), said).toBeNull();
    }
  });
});

describe("T4782 — “and a <thing> …” recovers exactly the clean parse", () => {
  const pairs = misheardPairs();

  it("has a real corpus to check", () => {
    expect(pairs.length).toBeGreaterThan(100);
  });

  it("parses every misheard sentence exactly as the clean one", () => {
    const wrong = pairs.filter(({ clean, heard }) =>
      JSON.stringify(parseCommand(heard)) !== JSON.stringify(parseCommand(clean)));
    expect(wrong.map((p) => p.heard)).toEqual([]);
  });

  it("covers the lines seen in production", () => {
    expect(parseCommand("and a start event called payment received"))
      .toEqual([{ op: "add", symbolType: "start-event", label: "payment received" }]);
    expect(parseCommand("And a boundary event called claim withdrawn to assess risk"))
      .toEqual([{ op: "addBoundary", hostRef: "assess risk", label: "claim withdrawn" }]);
  });
});

describe("T4783 — the fold's guards", () => {
  it("does not fold “at”: a place phrase stays with the AI", () => {
    // Paul approved "and" only. Each of these is null today and must stay so —
    // folded, several made a wrong element, and "at a task called review" split
    // at a pause would add a SECOND Review.
    for (const said of [
      "at a gateway add a task called escalate", "at a start add a timer", "at a start event add a timer",
      "at an end add a task called ship", "at a decision add a task called escalate",
      "at a task called review add a boundary event", "at a gateway, connect yes to approve",
      "at a gateway connect yes to approve", "at a task called review connect it to approve",
      "at a gateway called check if yes go to approve", "at a gateway split into yes and no",
      "at a gateway called approved route no to rework", "at a subprocess called billing loop back to review",
      "at a task called review we need a timer", "at a lane called sales", "at a pool called customer",
      "at an end event", "at a task called review", "at a boundary event called claim withdrawn to assess risk",
    ]) {
      expect(repairHeardWords(said), said).toBe(said);
      expect(parseCommand(said), said).toBeNull();
    }
  });

  it("declines when a second command follows the type word", () => {
    for (const said of [
      "and a gateway, connect yes to approve",
      "and a gateway connect yes to approve",
      "and a task called review connect it to approve",
    ]) {
      expect(repairAddWord(said).corrected, said).toBe(false);
      expect(parseCommand(said), said).toBeNull();
    }
  });

  it("still folds a name that merely starts with a verb", () => {
    expect(parseCommand("and a task called send invoice")).toEqual([{ op: "add", symbolType: "task", label: "send invoice" }]);
    expect(parseCommand("and a task called place order")).toEqual([{ op: "add", symbolType: "task", label: "place order" }]);
  });

  it("reads “new” as a modifier, never as a type", () => {
    expect(parseCommand("and a new one")).toBeNull();
    expect(parseCommand("and a new one called marketing")).toBeNull();
    expect(parseCommand("and a new task called invoice")).toEqual([{ op: "add", symbolType: "task", label: "invoice" }]);
  });

  it("leaves stranded tails and repeats exactly as they were", () => {
    expect(parseCommand("and after Review")).toEqual([{ op: "connect", fromRef: "Review", toRef: "the last" }]);
    expect(parseCommand("and before Approve")).toEqual([{ op: "connect", fromRef: "the last", toRef: "Approve" }]);
    expect(parseCommand("and again")).toEqual([{ op: "again" }]);
  });

  it("does not fold what was never heard: counts, “the”, “an”", () => {
    for (const said of ["and two lanes", "an end event called done", "and the task called review"]) {
      expect(repairHeardWords(said), said).toBe(said);
      expect(parseCommand(said), said).toBeNull();
    }
  });

  it("knows a second command when it sees one — and a verb-led name when it sees that", () => {
    expect(containsAnotherCommand("review connect it to approve")).toBe(true);
    expect(containsAnotherCommand("Review, add a task")).toBe(true);
    expect(containsAnotherCommand("Review add a task called Approve")).toBe(true);
    expect(containsAnotherCommand("send invoice")).toBe(false);
    expect(containsAnotherCommand("Create Order")).toBe(false);
    expect(startsWithCommandVerb(" connect yes to approve")).toBe(true);
    expect(startsWithCommandVerb(", connect yes to approve")).toBe(true);
    expect(startsWithCommandVerb(" called send invoice")).toBe(false);
  });
});

describe("T4784 — one rule, one place: the parser and the hold read the same words", () => {
  it("holds a misheard add exactly when it holds the clean one", () => {
    for (const [heard, clean] of [
      ["and a message from review", "add a message from review"],
      ["and message from review", "add message from review"],
    ]) {
      expect(isIncompleteCommand(heard), heard).toBe(isIncompleteCommand(clean));
      expect(isIncompleteCommand(heard), heard).toBe(true);
    }
    // "at" is not folded, so it is not held either — the same answer as the parser.
    expect(isIncompleteCommand("at a message from review")).toBe(false);
    expect(parseCommand("at a message from review")).toBeNull();
  });

  it("agrees on every word-prefix of every misheard corpus sentence", () => {
    const disagree: string[] = [];
    for (const { clean, heard } of misheardPairs()) {
      const cw = clean.split(/\s+/), hw = heard.split(/\s+/);
      for (let n = 1; n <= cw.length; n++) {
        const c = cw.slice(0, n).join(" "), h = hw.slice(0, n).join(" ");
        if (isIncompleteCommand(c) !== isIncompleteCommand(h)) disagree.push(h);
      }
    }
    expect(disagree).toEqual([]);
  });

  it("stitches a misheard message split at a pause into one command", () => {
    const out = stitchFinals([
      { text: "and a message from review", atMs: 0 },
      { text: "to customer labelled invoice", atMs: 2500 },
    ], 5000);
    expect(out).toEqual(["and a message from review to customer labelled invoice"]);
    expect(parseCommand(out[0])).toEqual([{ op: "addMessage", fromRef: "review", toRef: "customer", label: "invoice" }]);
  });

  it("folds every noun the grammar's own lists name", () => {
    // Behavioural proof the fold is BUILT from the shared lists: add a word to
    // any of them and it is folded here the same day, with no second edit.
    const nouns = [
      ...SYMBOL_PHRASES, ...POOL_WORDS, ...LANE_WORDS, ...SUBLANE_WORDS,
      ...PARTICIPANT_WORDS, ...BOX_WORDS, ...MESSAGE_WORDS, "boundary event", "timer boundary event",
    ];
    const missed = nouns.filter((w) => {
      const art = /^[aeiou]/i.test(w) ? "an" : "a";
      return !repairAddWord(`and ${art} ${w} called Finance`).corrected;
    });
    expect(missed).toEqual([]);
  });

  it("gives the grammar the same participant, box and message words", () => {
    for (const w of PARTICIPANT_WORDS) {
      expect(parseCommand(`add a ${w} called Courier`)?.[0], w).toMatchObject({ op: "addPool", poolType: "black-box", label: "Courier" });
    }
    for (const w of BOX_WORDS) {
      expect(parseCommand(`add a ${w} pool called Courier`)?.[0], w)
        .toMatchObject({ op: "addPool", poolType: /^black/.test(w) ? "black-box" : "white-box" });
    }
    for (const w of MESSAGE_WORDS) {
      expect(parseCommand(`add a ${w}`), w).toEqual([{ op: "addMessageByNumber" }]);
    }
  });

  it("wires both callers to the one repair and the one verb list", () => {
    const grammar = code("app", "lib", "assist", "commandGrammar.ts");
    const hold = code("app", "lib", "assist", "incompleteCommand.ts");
    for (const [name, src] of [["commandGrammar.ts", grammar], ["incompleteCommand.ts", hold]] as const) {
      expect(src, `${name} repairs through repairHeardWords`).toMatch(/repairHeardWords\(/);
      for (const one of ["repairTurnWord(", "repairSelectedWord(", "repairAddWord("]) {
        expect(src, `${name} must not call ${one} directly`).not.toContain(one);
      }
    }
    expect(hold).toMatch(/import \{ COMMAND_VERBS \} from "\.\/commandVerbs"/);
    expect(hold, "the hold must not keep its own verb literal").not.toMatch(/swap\|rename\|relabel/);
    // The grammar spells none of the shared nouns itself any more.
    expect(grammar).not.toMatch(/participant\(\?:/);
    expect(grammar).not.toMatch(/black\[- \]\?box/);
    expect(grammar).not.toMatch(/\(\?:message\|msg\)/);
    // The fold's noun list is read, not typed.
    const fold = code("app", "lib", "assist", "selectedWord.ts");
    for (const src of ["SYMBOL_PHRASES", "POOL_WORDS", "LANE_WORDS", "SUBLANE_WORDS", "PARTICIPANT_WORDS", "BOX_WORDS", "MESSAGE_WORDS", "BOUNDARY_EVENT_NOUN"]) {
      expect(fold, `the add-word fold reads ${src}`).toContain(src);
    }
    expect(fold).not.toMatch(/"participant|"black|"white|boundary\\\\s|"pool"|"lane"/);
  });

  it("keeps the hold's verb list exactly as it was, and make/turn out of it", () => {
    expect(COMMAND_VERBS).toContain("swap");
    expect(COMMAND_VERBS).toContain("set");
    expect(COMMAND_VERBS as readonly string[]).not.toContain("make");
    expect(COMMAND_VERBS as readonly string[]).not.toContain("turn");
    expect([...CONVERT_VERBS]).toEqual(["make", "turn"]);
    for (const bare of ["make", "Make", "turn", "Turn"]) expect(isIncompleteCommand(bare), bare).toBe(false);
  });
});

describe("T4785 — a boundary event is never a task, typed or hostless", () => {
  it("reads a hostless boundary event without inventing a host", () => {
    expect(parseCommand("add a boundary event called Timeout")).toEqual([{ op: "addBoundary", label: "Timeout" }]);
    expect(parseCommand("add a boundary event")).toEqual([{ op: "addBoundary" }]);
    expect(parseCommand("insert a boundary event called Timeout")).toEqual([{ op: "addBoundary", label: "Timeout" }]);
  });

  it("reads the trigger word and non-interrupting", () => {
    expect(parseCommand("add an error boundary event called Failed")).toEqual([{ op: "addBoundary", label: "Failed", eventType: "error" }]);
    expect(parseCommand("add a signal boundary event to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", eventType: "signal" }]);
    expect(parseCommand("add an escalation boundary event to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", eventType: "escalation" }]);
    expect(parseCommand("add a timer boundary event to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", eventType: "timer" }]);
    // Above the message bail, which used to take this for a message.
    expect(parseCommand("add a message boundary event to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", eventType: "message" }]);
    expect(parseCommand("add a non-interrupting timer boundary event to Review called Reminder"))
      .toEqual([{ op: "addBoundary", hostRef: "Review", label: "Reminder", eventType: "timer", nonInterrupting: true }]);
    expect(parseCommand("and a timer boundary event called Timeout")).toEqual([{ op: "addBoundary", label: "Timeout", eventType: "timer" }]);
  });

  it("takes its trigger words from the right-click menu's list", () => {
    for (const o of EVENT_OPTS) {
      const ops = parseCommand(`add a ${o.label.toLowerCase()} boundary event to Review`);
      if (o.value === "none" || o.value === "terminate" || o.value === "link") {
        // No BPMN boundary event carries these — and never a task either.
        expect(ops, o.value).toBeNull();
      } else {
        expect(ops, o.value).toEqual([{ op: "addBoundary", hostRef: "Review", eventType: o.value }]);
      }
    }
  });

  it("keeps every hosted form as it was", () => {
    expect(parseCommand("add a boundary event called Timeout to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", label: "Timeout" }]);
    expect(parseCommand("add a boundary event to Approve called Timeout")).toEqual([{ op: "addBoundary", hostRef: "Approve", label: "Timeout" }]);
    expect(parseCommand("add a boundary event called Timeout to this")).toEqual([{ op: "addBoundary", hostRef: "this", label: "Timeout" }]);
    expect(parseCommand("attach a boundary event to approve called timeout")).toEqual([{ op: "addBoundary", hostRef: "approve", label: "timeout" }]);
    expect(parseCommand("insert a boundary event called Timeout to Review")).toEqual([{ op: "addBoundary", hostRef: "Review", label: "Timeout" }]);
  });

  it("never produces an add, whatever the phrasing", () => {
    for (const said of [
      "add a boundary event called Timeout", "add a boundary event", "insert a boundary event called Timeout",
      "new boundary event called Timeout", "add a boundary event here", "give me a boundary event",
      "add an error boundary event called Failed", "add a signal boundary event to Review",
      "add a terminate boundary event to Review", "add a big boundary event called Late",
      "and a timer boundary event called Timeout", "add a boundary event after Review",
    ]) {
      const ops = parseCommand(said) ?? [];
      expect(ops.map((o) => o.op), said).not.toContain("add");
    }
  });

  it("sends a name that runs into a second command to the AI", () => {
    // Taken as one name, the task would silently never be added.
    expect(parseBoundaryEventPhrase("add a boundary event called Timeout add a task called Escalate")).toBe("unreadable");
    expect(parseCommand("add a boundary event called Timeout add a task called Escalate")).toBeNull();
  });

  it("is not held, hosted or not", () => {
    // Paul chose the selection as host: held, every selection-hosted boundary
    // event would wait the whole grace period (~12 s) for a "to …" that is not
    // coming. A trailing "to" or "called" is still held by the ordinary rule.
    for (const said of [
      "add a boundary event called Timeout", "add a boundary event",
      "add a boundary event called Timeout to Review", "add a message boundary event to Review",
    ]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
    expect(isIncompleteCommand("add a boundary event called Timeout to")).toBe(true);
    expect(isIncompleteCommand("add a boundary event called")).toBe(true);
  });
});

describe("T4786 — a boundary event with no host goes on the selected task", () => {
  it("mounts it on the one selected task", () => {
    const r = say("add a boundary event called Timeout", ["t1"]);
    expect(r.ok).toBe(true);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ type: "intermediate-event", boundaryHostId: "t1", label: "Timeout" });
  });

  it("works on a collapsed and an expanded subprocess too", () => {
    expect(say("add a boundary event", ["sub3"]).added[0]?.boundaryHostId).toBe("sub3");
    expect(say("add a boundary event", ["ep2"]).added[0]?.boundaryHostId).toBe("ep2");
  });

  it("keeps the trigger and non-interrupting", () => {
    const e = say("add an error boundary event called Failed", ["t3"]).added[0];
    expect(e).toMatchObject({ boundaryHostId: "t3", eventType: "error", label: "Failed" });
    const n = say("add a non-interrupting timer boundary event called Reminder", ["t3"]).added[0];
    expect(n).toMatchObject({ boundaryHostId: "t3", eventType: "timer" });
    expect(n.properties.interruptionType).toBe("non-interrupting");
  });

  it("refuses, adds nothing, and says what to say — when nothing is selected", () => {
    const r = say("add a boundary event called Timeout");
    expect(r.ok).toBe(false);
    expect(r.added).toEqual([]);
    expect(r.summary).toBe("say which task or subprocess it goes on — “add a boundary event called Timeout to <name>”");
  });

  it("refuses when the selection is not exactly one task or subprocess", () => {
    for (const sel of [["g"], ["t1", "t2"], ["p"], ["start"]]) {
      const r = say("add a timer boundary event", sel);
      expect(r.ok, sel.join(",")).toBe(false);
      expect(r.added, sel.join(",")).toEqual([]);
      expect(r.summary).toBe("say which task or subprocess it goes on — “add a timer boundary event to <name>”");
    }
  });

  it("still uses the NAMED host when one is said, whatever is selected", () => {
    const r = say("add a boundary event called Timeout to Assess Risk", ["t1"]);
    expect(r.ok).toBe(true);
    expect(r.added[0]).toMatchObject({ boundaryHostId: "t3", label: "Timeout" });
  });

  it("asks one set what may host a boundary event", () => {
    expect([...BOUNDARY_HOST_TYPES].sort()).toEqual(["subprocess", "subprocess-expanded", "task"]);
    expect(isBoundaryHost("gateway")).toBe(false);
    const users: Array<[string, string[]]> = [
      ["useDiagram.ts", ["app", "hooks", "useDiagram.ts"]],
      ["nextSteps.ts", ["app", "lib", "diagram", "nextSteps.ts"]],
      ["applyAssistOps.ts", ["app", "lib", "assist", "applyAssistOps.ts"]],
      ["Canvas.tsx", ["app", "components", "canvas", "Canvas.tsx"]],
      ["PropertiesPanel.tsx", ["app", "components", "canvas", "PropertiesPanel.tsx"]],
      // The simulator races every boundary event on a host the editor accepts.
      ["assemble.ts", ["app", "lib", "simulation", "assemble.ts"]],
    ];
    for (const [name, p] of users) {
      const src = code(...p);
      expect(src, `${name} imports the shared set`).toMatch(/from "(?:@\/app\/lib\/diagram|\.)\/boundaryHosts"/);
      expect(src, `${name} keeps no copy`).not.toMatch(/(?:BOUNDARY_HOST_TYPES(?:_LOCAL)?|HOST_TYPES|RACEABLE_HOSTS)\s*=\s*new Set/);
    }
    expect(code("app", "lib", "assist", "applyAssistOps.ts"))
      .not.toContain(`["task", "subprocess", "subprocess-expanded"].includes(host.type)`);
  });
});

describe("T4787 — the repair is invisible on everything heard correctly", () => {
  it("changes no clean generated sentence and no catalogue phrase", () => {
    // A future widening that touches a correctly heard command fails here.
    const touched = cleanCorpus().filter((s) => repairHeardWords(s) !== s);
    expect(touched).toEqual([]);
  });
});

describe("T4788 — “add the message” and “add messages” open the picker; never a task", () => {
  it("numbers the candidates for the article and the plural", () => {
    expect(parseCommand("add the message")).toEqual([{ op: "addMessageByNumber" }]);
    expect(parseCommand("add messages")).toEqual([{ op: "addMessageByNumber" }]);
    expect(parseCommand("add the message to the selected")).toEqual([{ op: "addMessageByNumber", fromSelection: true }]);
  });

  it("sends any other message phrasing to the AI, not to the add rule", () => {
    const ops: AssistOp[] = parseCommand("add messages from review to customer") ?? [];
    expect(ops.map((o) => o.op)).not.toContain("add");
  });

  it("the hold agrees — the by-number forms are complete, from the one pattern", () => {
    for (const said of ["add the message", "add messages", "add a message", "add the message to the selected"]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
    expect(isIncompleteCommand("add messages from review")).toBe(true);
    for (const f of [["app", "lib", "assist", "commandGrammar.ts"], ["app", "lib", "assist", "incompleteCommand.ts"]]) {
      expect(code(...f)).toMatch(/MESSAGE_BY_NUMBER\.test\(/);
    }
  });
});

describe("T4789 — a stranded “after X” asks the shared question: is there a second command?", () => {
  it("still takes a tail whose reference is an activity name, verb and all", () => {
    expect(parseCommand("after Send Invoice")).toEqual([{ op: "connect", fromRef: "Send Invoice", toRef: "the last" }]);
    // The private list read "Create" as a second command and sent this to the
    // AI — the path that invented the duplicate element in T4601.
    expect(parseCommand("after Create Order")).toEqual([{ op: "connect", fromRef: "Create Order", toRef: "the last" }]);
    // An article in front does not make the name's own verb a second command.
    expect(parseCommand("after the Send Invoice task")).toEqual([{ op: "connect", fromRef: "the Send Invoice task", toRef: "the last" }]);
    expect(parseCommand("after the start")).toEqual([{ op: "connect", fromRef: "the start", toRef: "the last" }]);
  });

  it("still leaves a whole sentence that begins with the connective alone", () => {
    for (const said of ["after Review add a task called Approve", "after Review, connect it to Approve", "before Approve put a timer"]) {
      expect(parseCommand(said)?.[0]?.op, said).not.toBe("connect");
    }
  });

  it("reads a verb AFTER the name as a second command, article or not", () => {
    // Read as tails, each of these connected the wrong pair — the resolver
    // fuzzy-matched "Review Claim" out of the whole run-on reference — and the
    // command actually spoken never ran.
    for (const said of [
      "after Review Claim add Escalate", "after Review Claim add task Escalate",
      "after Review Claim new task called Escalate", "before Check Coverage insert gateway",
      "after Review Claim rename Check Coverage to Verify", "after Review Claim make gateway",
      "after Review Claim delete Check Coverage", "after the start add task Approve",
    ]) {
      expect(parseCommand(said)?.[0]?.op, said).not.toBe("connect");
    }
    expect(hasCommandAfterName("Review Claim add Escalate")).toBe(true);
    expect(hasCommandAfterName("the start add task Approve")).toBe(true);
    expect(hasCommandAfterName("Send Invoice")).toBe(false);
    expect(hasCommandAfterName("the Send Invoice task")).toBe(false);
  });

  it("uses the shared answer, not a private verb list", () => {
    const grammar = code("app", "lib", "assist", "commandGrammar.ts");
    expect(grammar).toMatch(/const whole = hasCommandAfterName\(ref\);/);
    expect(grammar).not.toMatch(/add\|insert\|create\|put\|place\|new\|draw\|connect/);
  });
});

describe("T4790 — the hold waits only for a message that is being ADDED", () => {
  it("does not hold an element whose NAME has the message word in it", () => {
    for (const said of [
      "add a task called Receive Messages", "add a task called Process Messages",
      "create a task called Collect Messages after Review Claim",
      "add an intermediate event called Messages Received", "add a task called Send Message",
    ]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("lets the next command run on its own instead of stitching it into the name", () => {
    expect(stitchFinals([
      { text: "add a task called Receive Messages", atMs: 0 },
      { text: "connect it to Review Claim", atMs: 3000 },
    ], 6000)).toEqual(["add a task called Receive Messages", "connect it to Review Claim"]);
    expect(stitchFinals([
      { text: "add a task called Process Messages", atMs: 0 },
      { text: "add a gateway", atMs: 3000 },
    ], 6000)).toEqual(["add a task called Process Messages", "add a gateway"]);
  });

  it("still holds a message sentence that has not named both ends", () => {
    for (const said of [
      "add a message from review", "add messages from review", "and a message from review",
      "send a message to customer", "add a new message from review", "add another message from review",
      "add msg from review",
    ]) {
      expect(isIncompleteCommand(said), said).toBe(true);
    }
  });

  it("never makes a task of a message sentence it held", () => {
    for (const said of [
      "add a new message from review to customer", "add new message from review to customer",
      "add another message from review to customer",
    ]) {
      expect((parseCommand(said) ?? []).map((o) => o.op), said).not.toContain("add");
    }
  });

  it("asks the grammar's own question, with the grammar's own verbs", () => {
    const grammar = code("app", "lib", "assist", "commandGrammar.ts");
    const hold = code("app", "lib", "assist", "incompleteCommand.ts");
    expect(grammar).toMatch(/ADD_MESSAGE_LEAD\.test\(raw\)/);
    expect(hold).toMatch(/ADD_MESSAGE_LEAD\.test\(t\)/);
    // The from/to message rules build on the shared verb group, not a literal.
    expect(grammar).not.toMatch(/add\|create\|draw\|put\|send/);
    expect(grammar.match(/\$\{MESSAGE_VERB\}/g) ?? []).toHaveLength(2);
  });
});
