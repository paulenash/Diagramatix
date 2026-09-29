/**
 * Paul, 2026-09-28 (tests/fixtures/voice-debug/templates-session-1.json):
 *
 *   "New commands when Templates are displayed: 1. scroll {down, up, to top,
 *    to bottom}"
 *   On "delete event": "End event Send Reply was not found and then was not
 *    listed" — and "Include ALL events in "delete event" or "delete events"
 *    for coverage."
 *   "If a connector is selected and "insert task" then the new task should be
 *    added into the connector."
 *   ""insert a Task after selected" currently adds the task on a separate
 *    connector. It should also insert into the outgoing connector on the
 *    selected element, if there is one."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { parsePickAnswer, type PickFlow } from "@/app/lib/assist/disambiguate";
import { namesOverlap, spokenForm } from "@/app/lib/assist/resolveRef";
import { repairDeleteWord, repairHeardWords } from "@/app/lib/assist/selectedWord";
import { parseTemplateAnswer, parseTemplateScroll, templateScrollReply, templateScrollTarget, type TemplateCard } from "@/app/lib/assist/templatePick";
import { checkElementOverlap } from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramData } from "@/app/lib/diagram/types";
import { editorSource } from "./assistApplySource";

const session = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/templates-session-1.json", "utf8")).diagram;
const SEND_REPLY = "o0nhhwst";
/** Run one command, catching a "which one?" it raises. */
const run = (d: DiagramData, said: string, sel: { selectedIds?: readonly string[]; selectedConnectorId?: string } = {}) => {
  const h = headlessDiagram(structuredClone(d));
  let flow: PickFlow | null = null;
  const ctx = h.context({ ...sel, selectedIds: sel.selectedIds ? [...sel.selectedIds] : undefined });
  const orig = ctx.ui.setPickFlow;
  ctx.ui.setPickFlow = (f: PickFlow | null) => { flow = f; orig(f); };
  const r = applyAssistOps(parseCommand(said)!, ctx);
  return { h, r, flow: flow as PickFlow | null };
};

describe("T4989 — the template window scrolls by voice: “scroll down”, “scroll up”, “scroll to the top”, “scroll to the bottom”", () => {
  it("every way it is said — and a template's own words are never taken for it", () => {
    const cases: Array<[string, string | null]> = [
      ["scroll down", "down"], ["Scroll down.", "down"], ["scroll", "down"], ["page down", "down"], ["next page", "down"], ["down", "down"], ["scroll down a bit more", "down"],
      ["scroll up", "up"], ["page up", "up"], ["up", "up"], ["previous page", "up"],
      ["scroll to top", "top"], ["scroll to the top", "top"], ["back to the top", "top"], ["top", "top"],
      ["scroll to bottom", "bottom"], ["scroll to the bottom", "bottom"], ["go to the bottom", "bottom"], ["bottom", "bottom"],
      ["end", null], ["the end", null], ["start", null], ["twenty eight", null], ["after the gateway", null], ["scroll right", null],
    ];
    for (const [said, to] of cases) expect(parseTemplateScroll(said), said).toBe(to);
    const cards = [{ n: 1, id: "a", name: "Start and End Events", group: null, source: "builtin" }, { n: 2, id: "b", name: "Top", group: null, source: "user" }] as TemplateCard[];
    expect(parseTemplateAnswer("scroll down", cards, false)).toEqual({ kind: "scroll", to: "down" });
    expect(parseTemplateAnswer("top", cards, false), "a template's WHOLE name still wins").toMatchObject({ kind: "pick", card: { id: "b" } });
    expect(parseTemplateAnswer("one", cards, false)).toMatchObject({ kind: "pick", card: { id: "a" } });
  });

  it("a page is most of what shows; at either end it says so instead of claiming it moved", () => {
    const box = { scrollTop: 0, scrollHeight: 3000, clientHeight: 800 };
    expect(templateScrollTarget("down", box)).toEqual({ top: 680 });
    expect(templateScrollTarget("up", box)).toEqual({ already: "top" });
    expect(templateScrollTarget("bottom", box)).toEqual({ top: 2200 });
    expect(templateScrollTarget("up", { ...box, scrollTop: 1000 })).toEqual({ top: 320 });
    expect(templateScrollTarget("down", { ...box, scrollTop: 2200 })).toEqual({ already: "bottom" });
    expect(templateScrollTarget("down", { ...box, scrollTop: 1900 })).toEqual({ top: 2200 });
    expect(templateScrollTarget("top", { ...box, scrollTop: 1900 })).toEqual({ top: 0 });
    expect(templateScrollReply("down", { top: 680 })).toBe("scrolled down — say a number");
    expect(templateScrollReply("bottom", { top: 2200 })).toBe("scrolled to the bottom — say a number");
    expect(templateScrollReply("down", { already: "bottom" })).toBe("already at the bottom — say a number, or “scroll up”");
  });

  it("the editor reads it in the template flow and moves the window's own list; the window says it can", () => {
    const ed = editorSource();
    expect(ed).toContain('if (answer.kind === "scroll") {');
    expect(ed).toContain("const target = templateScrollTarget(answer.to, list);");
    expect(ed).toContain("scrollRef={templateScrollRef}");
    const win = readFileSync("app/components/canvas/TemplatePickerWindow.tsx", "utf8");
    expect(win).toContain('<div ref={scrollRef} className="flex-1 overflow-y-auto');
    expect(win).toContain("“scroll down” / “scroll up” / “scroll to the top”");
  });
});

describe("T4990 — a name drawn on two lines is one name, and nothing matches inside a word", () => {
  it("spokenForm and namesOverlap: “Send\\nReply” is “send reply”; “end” is not in “send reply”", () => {
    expect(spokenForm("Send\nReply")).toBe("send reply");
    expect(spokenForm("  Lane   two ")).toBe("lane 2");
    expect(namesOverlap("send reply", "send reply")).toBe(true);
    expect(namesOverlap("review invoice", "review")).toBe(true);
    expect(namesOverlap("review invoice", "revie")).toBe(true);
    expect(namesOverlap("review invoice", "invoice")).toBe(true);
    expect(namesOverlap("review", "the review step")).toBe(true);
    expect(namesOverlap("end", "send reply")).toBe(false);
    expect(namesOverlap("send reply", "end")).toBe(false);
    expect(namesOverlap("invoice", "voice")).toBe(false);
  });

  it("on Paul's diagram, “Send Reply” is found every way it is said — the two “End” events never offered for it", () => {
    for (const said of ["delete send reply", "delete event send reply", "delete the send reply event", "delete end event send reply"]) {
      const { h, r } = run(session(), said);
      expect(r, said).toEqual({ ok: true, summary: "deleted Send Reply" });
      expect(h.data.elements.some((e) => e.id === SEND_REPLY), said).toBe(false);
    }
  });
});

describe("T4991 — “delete event” and “delete events” list EVERY event", () => {
  it("all eight — start, intermediate, end — and “send reply” is an answer", () => {
    const d = session();
    const events = d.elements.filter((e) => /-event$/.test(e.type)).map((e) => e.id).sort();
    expect(events).toHaveLength(8);
    for (const said of ["delete event", "delete events", "delete the event"]) {
      const { h, r, flow } = run(d, said);
      expect(r.summary, said).toMatch(/say a number \(1–8\), or “cancel”$/);
      expect(flow!.targets.map((t) => t.id).sort(), said).toEqual(events);
      expect(parsePickAnswer("send reply", flow!)?.id, said).toBe(SEND_REPLY);
      expect(parsePickAnswer("Send Reply.", flow!)?.id, said).toBe(SEND_REPLY);
      expect(h.data.elements).toHaveLength(d.elements.length);
    }
    const ends = run(d, "delete end event").flow!;
    expect(ends.targets.map((t) => t.id).sort()).toEqual(d.elements.filter((e) => e.type === "end-event").map((e) => e.id).sort());
    expect(run(d, "rename the event to Go").flow!.targets).toHaveLength(8);
  });

  it("…and a task or subprocess with “Event” in its name is never offered as an event", () => {
    const { flow } = run(session(), "delete event");
    const kinds = flow!.targets.map((t) => session().elements.find((e) => e.id === t.id)!.type);
    expect(kinds.every((k) => /-event$/.test(k))).toBe(true);
  });
});

describe("T4992 — “letter” first is “delete” (his “letter event send reply”, said again as “delete event … send reply”)", () => {
  it("repaired only as the first word, and only with more after it", () => {
    expect(repairDeleteWord("letter event send reply")).toEqual({ text: "delete event send reply", corrected: true });
    expect(repairDeleteWord("Letter the gateway").text).toBe("Delete the gateway");
    expect(repairDeleteWord("letter").corrected).toBe(false);
    expect(repairDeleteWord("rename letter to Memo").corrected).toBe(false);
    expect(repairHeardWords("letter event send reply")).toBe("delete event send reply");
    expect(run(session(), "letter event send reply").r).toEqual({ ok: true, summary: "deleted Send Reply" });
  });
});

describe("T4993 — with a connector selected, “insert a task” goes INTO that connector", () => {
  const YES = "8klv7i1i";   // Pass Claim Check? → Task 1, labelled "Yes"

  it("spliced between its two ends: the connector keeps its label and now ends at the task; the task joins the rest", () => {
    for (const [said, label] of [["insert a task called Check", "Check"], ["insert task", undefined], ["insert a gateway", undefined]] as const) {
      const f = fixtureDiagram();
      const { h, r } = run(f, said, { selectedConnectorId: YES });
      expect(r.summary, said).toMatch(/^inserted .+ between Pass Claim Check\? and Task 1$/);
      const added = h.data.elements.filter((e) => !f.elements.some((x) => x.id === e.id));
      expect(added, said).toHaveLength(1);
      if (label) expect(added[0].label).toBe(label);
      const yes = h.data.connectors.find((c) => c.id === YES)!;
      expect([yes.targetId, yes.label], said).toEqual([added[0].id, "Yes"]);
      expect(h.data.connectors.some((c) => c.sourceId === added[0].id && c.targetId === "t4"), `${said}: on to Task 1`).toBe(true);
      expect(checkElementOverlap(h.data), said).toEqual([]);
    }
  });

  it("“add” is not “insert” — and a message or nothing selected changes nothing about how it is added", () => {
    const f = fixtureDiagram();
    expect(run(f, "add a task called Check", { selectedConnectorId: YES }).r).toEqual({ ok: true, summary: "added Check" });
    expect(run(f, "insert a task called Check").r).toEqual({ ok: true, summary: "added Check" });
    const msg = f.connectors.find((c) => c.type !== "sequence");
    if (msg) expect(run(f, "insert a task called Check", { selectedConnectorId: msg.id }).r.summary).toBe("added Check");
  });
});

describe("T4994 — “insert a task after X” goes INTO X's outgoing connector, when it has one", () => {
  it("“after selected”, “after Pay Claim”, “after selected called Check” — room made, Claim Closed joined on", () => {
    for (const [said, sel, label] of [
      ["insert a task after selected", { selectedIds: ["t6"] }, undefined],
      ["insert a task after selected called Check", { selectedIds: ["t6"] }, "Check"],
      ["insert a task called Z after Pay Claim", {}, "Z"],
    ] as const) {
      const f = fixtureDiagram();
      const { h, r } = run(f, said, sel);
      expect(r.summary, said).toMatch(/^inserted .+ between Pay Claim and Claim Closed — moved everything after Pay Claim in Claims Processing \d+px right to make room$/);
      const added = h.data.elements.filter((e) => !f.elements.some((x) => x.id === e.id))[0];
      if (label) expect(added.label, said).toBe(label);
      expect(h.data.connectors.find((c) => c.id === "c4")!.targetId, said).toBe(added.id);
      expect(checkElementOverlap(h.data), said).toEqual([]);
    }
    expect(parseCommand("insert a task after selected called Check")).toEqual([{ op: "add", symbolType: "task", label: "Check", afterRef: "selected", insert: true }]);
  });

  it("with several outgoing flows it cannot tell which, so it says how to choose", () => {
    const f = fixtureDiagram();
    expect(run(f, "insert a task after selected", { selectedIds: ["g"] }).r).toEqual({ ok: true, summary: "added task after Claim Approved? — Claim Approved? has 2 outgoing flows, so it is on a new one: say “insert a task between Claim Approved? and …” to put it into one" });
    // Nothing leaves an end event, so it cannot go INTO a flow: added after, as before.
    const end = run(f, "insert an end event called Done after Pay Claim");
    expect(end.r).toEqual({ ok: true, summary: "added Done after Pay Claim" });
    expect(end.h.data.connectors.find((c) => c.id === "c4")!.targetId).toBe(f.connectors.find((c) => c.id === "c4")!.targetId);
  });
});

describe("T4995 — “add … after X” goes INTO X's outgoing connector too (Paul, 2026-09-28: “Yes!!”)", () => {
  it("“add a task after selected”, “add a task called Approve after Pay Claim” — the same splice as “insert”", () => {
    for (const [said, sel, label] of [
      ["add a task after selected", { selectedIds: ["t6"] }, undefined],
      ["add a task called Approve after Pay Claim", {}, "Approve"],
      ["add a parallel gateway after selected", { selectedIds: ["t6"] }, undefined],
    ] as const) {
      const f = fixtureDiagram();
      const { h, r } = run(f, said, sel);
      expect(r.summary, said).toMatch(/^inserted .+ between Pay Claim and Claim Closed/);
      const added = h.data.elements.filter((e) => !f.elements.some((x) => x.id === e.id))[0];
      if (label) expect(added.label, said).toBe(label);
      expect(h.data.connectors.find((c) => c.id === "c4")!.targetId, said).toBe(added.id);
      expect(checkElementOverlap(h.data), said).toEqual([]);
    }
  });

  it("…but a selected connector is “insert” only; an end event, or a step with several flows, is joined on as before", () => {
    const f = fixtureDiagram();
    expect(run(f, "add a task called Check", { selectedConnectorId: "8klv7i1i" }).r).toEqual({ ok: true, summary: "added Check" });
    expect(run(f, "add an end event called Done after Pay Claim").r).toEqual({ ok: true, summary: "added Done after Pay Claim" });
    expect(run(f, "add a task after selected", { selectedIds: ["g"] }).r).toEqual({ ok: true, summary: "added task after Claim Approved? — Claim Approved? has 2 outgoing flows, so it is on a new one: say “insert a task between Claim Approved? and …” to put it into one" });
    expect(run(f, "add a task called Check").r, "no “after”: as before").toEqual({ ok: true, summary: "added Check" });
  });
});
