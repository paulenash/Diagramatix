/**
 * Paul's second "move dividers" session, 2026-09-28
 * (tests/fixtures/voice-debug/move-dividers-session-2.json):
 *
 *   "move finance boundary up" → the divider would run through “Task 8” — it
 *     can move up at most 98px: say “up by 98”          (refused)
 *   "sixty pixels"             → didn’t understand that
 *
 * Asked whether the named command should go through elements too: "No, that
 * command uses element positions inside the lane". So it keeps its rule — but
 * the refusal was wrong (Task 8 is FINANCE's, the band that grows), the reply
 * contradicted itself, and neither its advice nor his answer parsed.
 *
 * And: "Recognise all the following: "move divider" and "move lane divider",
 * "move dividers" and "move lane dividers" for the command".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { readBoundaryFollowUp, nextBoundaryMemory, type BoundaryMemory } from "@/app/lib/assist/boundaryFollowUp";
import { readLoneAmount } from "@/app/lib/assist/poolBoundaryPhrase";
import { contentCrossedBy, cutByLine, dividerRoom } from "@/app/lib/diagram/laneBoundary";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { diagramKeyterms } from "@/app/lib/dictation/diagramKeyterms";
import type { DiagramData } from "@/app/lib/diagram/types";

const session2 = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/move-dividers-session-2.json", "utf8")).diagram;
const session4 = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/boundary-session-4.json", "utf8")).diagram;
const OFFICE = "2uv54rys", FINANCE = "6ry0lcpt";
const byId = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
/** Finance's own — the diagram has a second "End", outside every lane. */
const inFinance = (d: DiagramData, l: string) => d.elements.find((e) => e.label === l && e.parentId === FINANCE)!;

/** Say one utterance the way the editor routes it: the grammar first, then the follow-up. */
const say = (h: ReturnType<typeof headlessDiagram>, heard: string) => {
  const ops = parseCommand(heard);
  if (ops) return applyAssistOps(ops, h.context());
  const f = h.boundaryLast.current ? readBoundaryFollowUp(heard, h.boundaryLast.current) : null;
  if (!f) return { ok: false, summary: "didn’t understand that" };
  if ("reply" in f) return { ok: true, summary: f.reply };
  const r = applyAssistOps([f.op], h.context());
  const mem = h.boundaryLast.current;
  return { ok: r.ok, summary: `${r.summary}${f.inAll && r.ok && mem ? ` (${mem.moved}px ${mem.direction} in all)` : ""}` };
};

describe("T4979 — the named boundary command counts only the lane that GIVES WAY — and its reply never contradicts itself", () => {
  it("Paul's refusal: “move finance boundary up” now moves — Task 8 is Finance's, and Finance is the lane that grows", () => {
    const d = session2();
    const h = headlessDiagram(d);
    expect(cutByLine([inFinance(d, "Task 8"), inFinance(d, "End")], byId(d, FINANCE).y), "both straddle the line, still Finance's").toHaveLength(2);
    const r = say(h, "move finance boundary up");
    expect(r).toEqual({ ok: true, summary: "moved Finance's top boundary up 20px" });
    expect(byId(h.data, FINANCE).y).toBeCloseTo(byId(d, FINANCE).y - 20, 6);
    for (const e of d.elements) if (!["pool", "lane"].includes(e.type)) expect(byId(h.data, e.id).y, `${e.label} never moves`).toBe(e.y);
  });

  it("contentCrossedBy looks only in the band giving way — the band dividerRoom measures, so the refusal and the room always agree", () => {
    const d = session2();
    const line = byId(d, FINANCE).y;
    expect(contentCrossedBy(d.elements, OFFICE, FINANCE, line - 20), "up: Office gives way, and nothing of Office's is within 20px").toEqual([]);
    expect(contentCrossedBy(d.elements, OFFICE, FINANCE, line + 1).map((e) => e.label).sort(), "down: Finance gives way — and the line is already in these").toEqual(["End", "Task 8"]);
    expect(contentCrossedBy(d.elements, OFFICE, FINANCE, line)).toEqual([]);
    // Refused up → the room it names is always enough; asked for exactly that, it moves.
    const room = Math.floor(dividerRoom(d.elements, OFFICE, FINANCE, "up"));
    expect(contentCrossedBy(d.elements, OFFICE, FINANCE, line - room)).toEqual([]);
    expect(contentCrossedBy(d.elements, OFFICE, FINANCE, line - room - 2).length).toBeGreaterThan(0);
  });

  it("into what the line already cuts, it says so — and points at “move dividers” — changing nothing", () => {
    const h = headlessDiagram(session2());
    // Finance is at its name floor here, and that is said first:
    expect(say(h, "move office boundary down")).toEqual({ ok: false, summary: "Finance is as small as its name allows — the divider can't move down" });
    say(h, "move finance boundary up");   // 20px of room for Finance to give back
    const before = structuredClone(h.data.elements);
    const r = say(h, "move office boundary down by 3");
    expect(r).toEqual({ ok: false, summary: "the divider already runs through “Task 8” — it can't go further down: move it first, or use “move dividers”, which goes through elements" });
    expect(h.data.elements).toEqual(before);
  });

  it("every “at most Npx: say “… by N”” on Paul's diagrams can be taken at its word", () => {
    for (const [load, said] of [[session4, "move Underwriters team top boundary up 100 pixels"], [session2, "move finance boundary up 200"]] as const) {
      const h = headlessDiagram(load());
      const r = say(h, said);
      expect(r.ok, said).toBe(false);
      const m = r.summary.match(/at most (\d+)px: say “(up|down) by (\d+)”$/);
      expect(m, r.summary).toBeTruthy();
      const again = say(h, `${m![2]} by ${m![3]}`);
      expect(again, `${said} → “${m![2]} by ${m![3]}”`).toEqual({ ok: true, summary: expect.stringMatching(new RegExp(`boundary ${m![2]} ${m![3]}px`)) });
    }
  });
});

describe("T4980 — a boundary command's follow-up: “sixty pixels”, “up by 98”", () => {
  const mem: BoundaryMemory = { targetId: FINANCE, boundary: "top", direction: "up", moved: 0 };

  it("the reply's own advice parses now, and so does an amount on its own", () => {
    expect(parseCommand("up by 98"), "nothing else claims it").toBeNull();
    expect(parseCommand("sixty pixels")).toBeNull();
    expect(readBoundaryFollowUp("up by 98", mem)).toEqual({ op: { op: "movePoolBoundary", ref: `#id:${FINANCE}`, boundary: "top", direction: "up", distance: 98 }, inAll: false });
    expect(readBoundaryFollowUp("down two tasks", mem)).toMatchObject({ op: { direction: "down", distance: 128 }, inAll: false });
    expect(readBoundaryFollowUp("up", mem)).toEqual({ op: { op: "movePoolBoundary", ref: `#id:${FINANCE}`, boundary: "top", direction: "up" }, inAll: false });
    expect(readBoundaryFollowUp("OK, up a bit.", mem)).toMatchObject({ op: { direction: "up", distance: 10 } });
    expect(readBoundaryFollowUp("sixty pixels", mem)).toMatchObject({ op: { direction: "up", distance: 60 }, inAll: true });
    expect(readBoundaryFollowUp("by sixty", mem)).toMatchObject({ op: { distance: 60 }, inAll: true });
    expect(readBoundaryFollowUp("make it a hundred pixels", mem)).toMatchObject({ op: { distance: 100 }, inAll: true });
  });

  it("an amount on its own is that much IN ALL — the rest, back again if it went too far, or nothing", () => {
    const after20: BoundaryMemory = { ...mem, moved: 20 };
    expect(readBoundaryFollowUp("sixty pixels", after20)).toMatchObject({ op: { direction: "up", distance: 40 }, inAll: true });
    expect(readBoundaryFollowUp("ten pixels", after20)).toMatchObject({ op: { direction: "down", distance: 10 }, inAll: true });
    expect(readBoundaryFollowUp("twenty pixels", after20)).toEqual({ reply: "it has moved 20px up already" });
  });

  it("…and nothing else is taken for one: a small bare number, the other axis, words", () => {
    for (const said of ["two", "five", "left by 40", "right", "Task 8", "sixty pixels to the left", "the finance lane", "done", ""]) {
      expect(readBoundaryFollowUp(said, mem), said).toBeNull();
    }
    const side: BoundaryMemory = { targetId: "P", boundary: "right", direction: "right", moved: 0 };
    expect(readBoundaryFollowUp("left by 40", side)).toMatchObject({ op: { boundary: "right", direction: "left", distance: 40 } });
    expect(readBoundaryFollowUp("up by 40", side)).toBeNull();
    expect(readLoneAmount(["two"], true)).toBeNull();
    expect(readLoneAmount(["twelve"], true)).toBe(12);
    expect(readLoneAmount(["two", "steps"], true)).toBe(40);
  });

  it("moves of the same boundary add up; another boundary starts again", () => {
    const a = nextBoundaryMemory(null, { targetId: "L", boundary: "top", direction: "up", moved: 20 });
    const b = nextBoundaryMemory(a, { targetId: "L", boundary: "top", direction: "up", moved: 40 });
    expect(b).toEqual({ targetId: "L", boundary: "top", direction: "up", moved: 60 });
    expect(nextBoundaryMemory(b, { targetId: "L", boundary: "top", direction: "down", moved: 80 })).toEqual({ targetId: "L", boundary: "top", direction: "down", moved: 20 });
    expect(nextBoundaryMemory(b, { targetId: "L", boundary: "top", direction: "down", moved: 0 }), "a refusal keeps the total").toEqual(b);
    expect(nextBoundaryMemory(b, { targetId: "M", boundary: "top", direction: "down", moved: 0 })).toEqual({ targetId: "M", boundary: "top", direction: "down", moved: 0 });
  });

  it("played through on Paul's diagram: refused, then “sixty pixels” — and a pool edge follows up the same way", () => {
    const d = session2();
    const h = headlessDiagram(d);
    const line = byId(d, FINANCE).y;
    expect(say(h, "move finance boundary up 200")).toMatchObject({ ok: false });
    expect(h.boundaryLast.current).toEqual({ targetId: FINANCE, boundary: "top", direction: "up", moved: 0 });
    expect(say(h, "sixty pixels")).toEqual({ ok: true, summary: "moved Finance's top boundary up 60px (60px up in all)" });
    // Office's room was 98px: a hundred in all is 40 more, and only 38 are left — said, and sayable.
    expect(say(h, "a hundred pixels")).toEqual({ ok: false, summary: expect.stringMatching(/it can move up at most 38px: say “up by 38”$/) });
    expect(h.boundaryLast.current?.moved, "a refusal keeps the total").toBe(60);
    expect(say(h, "up by 38")).toEqual({ ok: true, summary: "moved Finance's top boundary up 38px" });
    expect(say(h, "down by 30")).toEqual({ ok: true, summary: "moved Finance's top boundary down 30px" });
    expect(h.boundaryLast.current).toEqual({ targetId: FINANCE, boundary: "top", direction: "up", moved: 68 });
    expect(byId(h.data, FINANCE).y).toBeCloseTo(line - 68, 6);
    // A pool edge: "move Finance bottom boundary down" is My company's bottom edge.
    const p = headlessDiagram(session2());
    const r = say(p, "move Finance bottom boundary down");
    expect(r.ok).toBe(true);
    expect(p.boundaryLast.current).toMatchObject({ boundary: "bottom", direction: "down", moved: 20 });
    expect(say(p, "fifty pixels")).toMatchObject({ ok: true, summary: expect.stringMatching(/boundary down 30px \(50px down in all\)$/) });
  });

  it("the editor: the grammar first, then the follow-up, then the AI; any other command ends it", () => {
    const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    const parse = ed.indexOf("    const ops = parseCommand(heard);\n    if (ops) { applyOrAsk(ops, false); return; }");
    const follow = ed.indexOf("const f = readBoundaryFollowUp(heard, boundaryLastRef.current);");
    const ai = ed.indexOf("await fetch(\"/api/ai/command\"");
    expect(parse).toBeGreaterThan(0);
    expect(follow).toBeGreaterThan(parse);
    expect(ai).toBeGreaterThan(follow);
    expect(ed).toContain('if (!(ops.length === 1 && ops[0].op === "movePoolBoundary" && !ops[0].overContent)) boundaryLastRef.current = null;');
    expect(ed).toContain("refs: { voiceLastId, pointerWorld, selectedIdsRef, selectedConnectorIdRef, nextStepRef, openTemplateWindowRef, exportJsonRef, boundaryLast: boundaryLastRef },");
    expect(ed).toContain("boundaryLastRef.current = null;   // nor a boundary's follow-up");
  });
});

describe("T4981 — “move divider”, “move lane divider”, “move dividers”, “move lane dividers”", () => {
  it("Paul's four, and the forms a recogniser writes them in, open the numbers — never held as half a move", () => {
    for (const said of ["move divider", "move lane divider", "move dividers", "move lane dividers",
      "Move divider.", "Move lane dividers.", "move a divider", "move divider's", "move lane divider's", "move lanes' dividers",
      "move the lane dividers please", "move all the dividers", "move dividers now", "move the sub-lane dividers", "move line divider"]) {
      expect(parseCommand(said), said).toEqual([{ op: "numberDividers" }]);
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("…but a divider with a way or a lane is still the boundary command", () => {
    expect(parseCommand("move Finance divider up")?.[0]).toMatchObject({ op: "movePoolBoundary", direction: "up" });
    expect(parseCommand("move the divider up")?.[0]?.op).not.toBe("numberDividers");
    expect(parseCommand("move dividers up")?.[0]?.op).not.toBe("numberDividers");
  });

  it("the Commands card lists all four; a label with “divider” in it is never sent to the recogniser as a name", () => {
    const says = COMMAND_CATALOG.flatMap((f) => f.items.flatMap((i) => i.say));
    for (const s of ["move dividers", "move divider", "move lane dividers", "move lane divider"]) expect(says).toContain(s);
    expect(diagramKeyterms(["Divider Review", "Dividers Team", "Accounts Payable"])).toEqual(["Accounts Payable"]);
  });
});
