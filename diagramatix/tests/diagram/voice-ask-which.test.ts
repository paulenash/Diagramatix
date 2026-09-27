/**
 * Paul's two rulings of 2026-09-27, on his second test diagram:
 *   1. "Should a bare 'the pool' / 'the gateway' ask which one when there are
 *      several?" — Yes.
 *   2. Several connectors with one label ("delete connector Yes" with three Yes
 *      flows) — Yes, a numbered picker.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps, type AssistApplyContext } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { bareKindChoice, resolveRef } from "@/app/lib/assist/resolveRef";
import { connectorResolution } from "@/app/lib/assist/connectorRef";
import { parsePickAnswer, substituteRef, type PickFlow } from "@/app/lib/assist/disambiguate";
import type { AssistOp } from "@/app/lib/assist/ops";
import type { DiagramElement } from "@/app/lib/diagram/types";

/** The test diagram, a way to run a command on it, and the picker it raised (if any). */
function session() {
  const h = headlessDiagram(fixtureDiagram());
  let flow: PickFlow | null = null;
  const ctx = (o: { selectedIds?: string[]; lastAdded?: string | null } = {}): AssistApplyContext => {
    const c = h.context({ selectedIds: o.selectedIds ?? [] });
    return {
      ...c,
      ui: { ...c.ui, setPickFlow: (f: PickFlow | null) => { flow = f; } },
      refs: { ...c.refs, voiceLastId: { current: o.lastAdded ?? null } },
    };
  };
  const say = (text: string, o: { selectedIds?: string[]; lastAdded?: string | null } = {}) =>
    applyAssistOps(parseCommand(text)!, ctx(o));
  const run = (ops: AssistOp[], o: { selectedIds?: string[]; lastAdded?: string | null } = {}) => applyAssistOps(ops, ctx(o));
  /** Answer the open picker the way the editor does: the id goes back into the parked command. */
  const answer = (spoken: string) => {
    const f = flow!;
    const chosen = parsePickAnswer(spoken, f);
    if (!chosen) return null;
    flow = null;
    return { chosen, r: applyAssistOps(substituteRef(f.ops, f.ref, chosen.id), ctx()) };
  };
  return {
    h, say, run, answer,
    get flow() { return flow; },
    el: (id: string) => h.data.elements.find((e) => e.id === id)!,
    conns: (label: string) => h.data.connectors.filter((c) => (c.label ?? "").trim() === label),
  };
}
const E = (id: string, type: string) => ({ id, type, label: id, x: 0, y: 0, width: 10, height: 10, properties: {} }) as unknown as DiagramElement;

describe("T4939 — a bare “the pool” / “the gateway” asks which when there are several (Paul, 2026-09-27)", () => {
  it("the rule: the only one, the one selected, the one just added (never under strict), or the question", () => {
    const three = [E("a", "gateway"), E("b", "gateway"), E("c", "gateway")];
    expect(bareKindChoice([three[0]], [], null)).toEqual({ id: "a" });
    expect(bareKindChoice(three, [], null)).toEqual({ ambiguous: ["a", "b", "c"] });
    expect(bareKindChoice(three, ["b"], null)).toEqual({ id: "b" });
    expect(bareKindChoice(three, ["a", "b"], null), "two selected says nothing").toEqual({ ambiguous: ["a", "b", "c"] });
    expect(bareKindChoice(three, [], "c")).toEqual({ id: "c" });
    expect(bareKindChoice(three, [], "c", true), "a destroy never takes what was just added").toEqual({ ambiguous: ["a", "b", "c"] });
    // Never the last in the file just for being last.
    expect(resolveRef("the gateway", three)).toEqual({ ambiguous: ["a", "b", "c"] });
  });

  it("“rename the gateway to Approved?” on the test diagram asks, numbered — and the number finishes it", () => {
    const s = session();
    const r = s.say("rename the gateway to Approved?");
    expect(r).toEqual({ ok: true, summary: "which “the gateway”? say a number (1–3), or “cancel”" });
    expect(s.h.data.elements.filter((e) => e.label === "Approved?")).toEqual([]);
    const target = s.flow!.targets.find((t) => t.id === "g")!;
    const done = s.answer(String(target.n))!;
    expect(done.r.ok, done.r.summary).toBe(true);
    expect(s.el("g").label).toBe("Approved?");
    expect(s.el("p5fku96e").label, "not the last gateway in the file").toBe("Re-work\nRequired?");
  });

  it("the gateway SELECTED, or the one you just added, is the one — no question", () => {
    const sel = session();
    expect(sel.say("rename the gateway to Approved?", { selectedIds: ["g2"] }).ok).toBe(true);
    expect(sel.el("g2").label).toBe("Approved?");
    expect(sel.flow).toBeNull();
    const just = session();
    expect(just.say("rename the gateway to Approved?", { lastAdded: "g" }).ok).toBe(true);
    expect(just.el("g").label).toBe("Approved?");
  });

  it("“add a lane to the pool” asks among the pools — and never turns a black-box pool white-box by guessing", () => {
    const s = session();
    const r = s.say("add a lane to the pool");
    expect(r.summary).toBe("which “the pool”? say a number (1–3), or “cancel”");
    expect(["cust", "sys"].map((id) => s.el(id).properties.poolType)).toEqual(["black-box", "black-box"]);
    const lanesBefore = s.h.data.elements.filter((e) => e.type === "lane").length;
    const done = s.answer(String(s.flow!.targets.find((t) => t.id === "p")!.n))!;
    expect(done.r.ok, done.r.summary).toBe(true);
    expect(s.h.data.elements.filter((e) => e.type === "lane" && e.parentId === "p")).toHaveLength(4);
    expect(s.h.data.elements.filter((e) => e.type === "lane")).toHaveLength(lanesBefore + 1);
  });

  it("every command asks the same way — not only the few that had their own picker", () => {
    // “nudge pool down” and the pool-boundary move answered “say the name”
    // before, or moved Claims System: one place now raises the picker.
    for (const said of ["nudge the pool down", "move the pool left boundary right"]) {
      const s = session();
      const r = s.say(said);
      expect(r.summary, said).toBe("which “the pool”? say a number (1–3), or “cancel”");
      expect(r.ok, said).toBe(true);
    }
    // The parked nudge said no pool at all; the words ride in it, so the number lands.
    const s = session();
    s.say("nudge the pool down");
    const y = s.el("cust").y;
    const done = s.answer(String(s.flow!.targets.find((t) => t.id === "cust")!.n))!;
    expect(done.r.ok, done.r.summary).toBe(true);
    expect(s.el("cust").y).toBe(y + 20);
  });

  it("a parked question re-runs from the command that asked — what already ran never runs twice", () => {
    const s = session();
    const r = s.run([
      { op: "rename", ref: "Task 1", label: "Alpha" },
      { op: "rename", ref: "the gateway", label: "Beta" },
    ]);
    expect(r.summary).toBe("renamed Task 1 → Alpha; which “the gateway”? say a number (1–3), or “cancel”");
    expect(s.flow!.ops).toEqual([{ op: "rename", ref: "the gateway", label: "Beta" }]);
  });

  it("the AI keeps a bare “the pool” as said — the app asks, the model never picks", () => {
    expect(readFileSync("app/api/ai/command/route.ts", "utf8"))
      .toContain("A bare \"the pool\" / \"the gateway\" stays exactly that — never swap in a name: with several, the app asks the user which.");
  });

  it("“add a lane above Lane 3” names no pool: Lane 3 does, so nothing is asked", () => {
    expect(parseCommand("add a lane above Lane 3")).toEqual([{ op: "addLaneAt", position: "above", refLane: "Lane 3" }]);
    const s = session();
    const r = s.say("add a lane above Lane 3");
    expect(s.flow).toBeNull();
    expect(r.summary).not.toContain("which");
  });
});

describe("T4940 — several connectors with one label: a numbered picker (Paul, 2026-09-27)", () => {
  it("“delete connector Yes” with three Yes flows asks, numbered on the connectors, and deletes nothing yet", () => {
    const s = session();
    expect(s.conns("Yes")).toHaveLength(3);
    const r = s.say("delete connector Yes");
    expect(r).toEqual({ ok: true, summary: "which “connector Yes”? 3 connectors have that name — say a number (1–3), or “cancel”" });
    expect(s.conns("Yes")).toHaveLength(3);
    expect(s.flow!.targets.map((t) => t.kind)).toEqual(["connector", "connector", "connector"]);
    expect(s.flow!.targets.map((t) => t.n)).toEqual([1, 2, 3]);
  });

  it("the number deletes exactly that one; saying “Yes” again is no answer — all three are called that", () => {
    const s = session();
    s.say("delete connector Yes");
    expect(s.answer("Yes"), "a name all three share picks none").toBeNull();
    const second = s.flow!.targets.find((t) => t.n === 2)!.id;
    const done = s.answer("two")!;
    expect(done.chosen.id).toBe(second);
    expect(done.r).toEqual({ ok: true, summary: "deleted connector “Yes”" });
    expect(s.conns("Yes").map((c) => c.id).sort()).not.toContain(second);
    expect(s.conns("Yes")).toHaveLength(2);
  });

  it("the rename asks too, and renames only the one picked", () => {
    const s = session();
    const r = s.say("rename connector No to Rejected");
    expect(r.summary).toBe("which “connector No”? 3 connectors have that name — say a number (1–3), or “cancel”");
    const first = s.flow!.targets[0].id;
    expect(s.answer("1")!.r.ok).toBe(true);
    expect(s.h.data.connectors.find((c) => c.id === first)!.label).toBe("Rejected");
    expect(s.conns("No")).toHaveLength(2);
  });

  it("one connector of that name is still just done; the scorers see several as a question", () => {
    const s = session();
    expect(s.say("delete connector Rejection Notification").summary).toBe("deleted message “Rejection Notification”");
    const { connectors } = fixtureDiagram();
    const yes = connectorResolution(connectors, "connector Yes", null);
    expect(yes && "ambiguous" in yes ? yes.ambiguous : null).toHaveLength(3);
    expect(connectorResolution(connectors, "Payment Details", null)).toMatchObject({ id: expect.stringMatching(/^connector:/) });
  });
});
