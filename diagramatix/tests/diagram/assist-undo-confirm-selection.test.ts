/**
 * Voice Assist, session 1 (15 Sep 2026): the three undo defects the review found,
 * a confirmation for destructive commands, and the selection as a reference.
 *
 * The pure halves are tested as functions. The editor wiring is pinned by
 * reading the source, because the defects were exactly the kind that compile
 * and pass every existing test: a helper called without its commit, a snapshot
 * taken once, a promise in a docblock nobody implemented.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHistoryGroupGate } from "@/app/lib/diagram/historyGroup";
import { syntheticElement, withAdded, withDeleted, withLabel } from "@/app/lib/assist/workingSet";
import { needsConfirmation, parseConfirmation } from "@/app/lib/assist/confirm";
import { resolveRef, resolveSelectionRefs, isSelectionRef } from "@/app/lib/assist/resolveRef";
import { serializeDiagramForCommand } from "@/app/lib/assist/serializeDiagram";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const src = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");
const editor = () => src("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
/** The body of a top-level `const NAME = useCallback(` in the editor, up to its deps array. */
const callbackBody = (source: string, name: string) => {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = source.indexOf("\n  }, [", start);
  return source.slice(start, end);
};

const el = (id: string, type: string, label = "", extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });

describe("B3 — one spoken command, one undo", () => {
  it("T4388 — the history gate admits every push outside a group and only the first inside", () => {
    const g = createHistoryGroupGate();
    expect(g.open).toBe(false);
    expect([g.admit(), g.admit()]).toEqual([true, true]);      // no group: everything through

    g.begin();
    expect(g.open).toBe(true);
    expect([g.admit(), g.admit(), g.admit()]).toEqual([true, false, false]); // one snapshot per command
    g.end();
    expect(g.open).toBe(false);
    expect(g.admit()).toBe(true);                              // gate reset after the group

    // Nesting: a group inside a group ends once, and the first push still wins.
    g.begin(); g.begin();
    expect([g.admit(), g.admit()]).toEqual([true, false]);
    g.end();
    expect(g.open).toBe(true);
    expect(g.admit()).toBe(false);
    g.end();
    expect(g.open).toBe(false);

    // A group in which nothing pushed leaves the next command's push admitted.
    g.begin(); g.end();
    expect(g.admit()).toBe(true);
  });

  it("T4389 — useDiagram consults the gate in pushHistory, and every command runs inside a group", () => {
    const hook = src("app", "hooks", "useDiagram.ts");
    const push = hook.slice(hook.indexOf("function pushHistory("), hook.indexOf("function invalidateRedo("));
    expect(push, "pushHistory must ask the gate FIRST").toMatch(/function pushHistory\([^)]*\)\s*\{\s*if \(!historyGroupRef\.current\.admit\(\)\) return;/);
    expect(hook).toContain("beginHistoryGroup,");
    expect(hook).toContain("endHistoryGroup,");

    const e = editor();
    const grouped = callbackBody(e, "applyGrouped");
    expect(grouped).toMatch(/beginHistoryGroup\(\);\s*try \{ return applyAssistOps\(ops\); \} finally \{ endHistoryGroup\(\); \}/);
    const run = callbackBody(e, "runVoiceCommand");
    expect(run, "runVoiceCommand must apply through the group, never bare").not.toContain("applyAssistOps(");
    expect(run).toContain("applyGrouped(");
  });
});

describe("B2 — a voice move is committed", () => {
  it("T4390 — every moveElements in applyAssistOps is followed by elementsMoveEnd", () => {
    // moveElements() only STAGES a move (it stashes the pre-move snapshot and
    // sets groupDragging); elementsMoveEnd() pushes the history entry and
    // re-routes connectors. Without it a voice move had no undo, and the next
    // mouse drag's end committed a snapshot from before the voice move.
    const body = callbackBody(editor(), "applyAssistOps");
    const calls = [...body.matchAll(/moveElements\(/g)].map((m) => m.index!);
    expect(calls.length).toBeGreaterThanOrEqual(2); // move + nudgePool
    for (const i of calls) {
      const after = body.slice(i, i + 160);
      expect(after, `moveElements at ${i} must commit`).toContain("elementsMoveEnd()");
    }
  });
});

describe("B1 — a batch sees what it has already done", () => {
  it("T4391 — the working set threads add / delete / rename through, and the editor uses it", () => {
    const base = [el("a", "task", "A"), el("b", "task", "B", { boundaryHostId: "a" } as never)];
    const added = withAdded(base, syntheticElement("c", "gateway", { x: 100, y: 50 }, 40, 40, { label: "C?", parentId: "lane1" }));
    expect(added).toHaveLength(3);
    const c = added[2];
    expect(c).toMatchObject({ id: "c", type: "gateway", label: "C?", parentId: "lane1", width: 40, height: 40 });
    expect([c.x, c.y], "center → top-left").toEqual([80, 30]);
    expect(withLabel(added, "c", "Approved?").find((e) => e.id === "c")!.label).toBe("Approved?");
    // Deleting a host takes its boundary events with it, as the reducer does.
    expect(withDeleted(added, "a").map((e) => e.id)).toEqual(["c"]);
    expect(base, "pure — the input is untouched").toHaveLength(2);

    const body = callbackBody(editor(), "applyAssistOps");
    expect(body, "a WORKING copy, not a one-time snapshot").toContain("let els: DiagramElement[] = data.elements;");
    // The CLAIM is that the newly added element is threaded into the working
    // copy, not the expression that builds it. R7 (2026-09-20) had to build the
    // synthetic element one step earlier, so it could be handed to `canConnect`
    // before the auto-connect, and the add site now names that binding instead
    // of constructing it inline.
    expect(body).toMatch(/const addedEl = syntheticElement\(newId/);
    expect(body).toMatch(/voiceLastId\.current = newId;\s*els = withAdded\(els, addedEl\);/);
    expect(body).toMatch(/deleteElement\(e\.id\);\s*els = withDeleted\(els, e\.id\);/);
    expect(body).toContain("els = withLabel(els, e.id, newLabel);");
    // The resolver reads the working copy AND the selection. (It gained a
    // fifth argument on 2026-09-20 — R3's `strict`, which stops a DESTRUCTIVE
    // command guessing between candidates. The claim here is unchanged: the
    // working copy and the selection are what it resolves against.)
    // The CLAIM: the resolver reads the WORKING COPY and the selection. The
    // options object has grown twice since — R3's `strict` (2026-09-20) and
    // M5's `pointer` (2026-09-21) — without changing that claim, so it is
    // asserted rather than the literal argument list.
    expect(body).toMatch(/resolveRef\(ref, els, voiceLastId\.current, selectedIds,/);
    expect(body, "and the pointer rides along with the options, not instead of them")
      .toMatch(/resolveRef\(ref, els, voiceLastId\.current, selectedIds, \{ \.\.\.opts, pointer: pointerWorld\.current \}\)/);
  });
});

describe("R1 — destructive commands ask first", () => {
  const pool = el("p", "pool", "Warehouse");
  const lane = el("l", "lane", "Sales", { parentId: "p" });
  const t1 = el("t1", "task", "Pick", { parentId: "l" });
  const t2 = el("t2", "task", "Pack", { parentId: "l" });
  const els = [pool, lane, t1, t2];

  it("T4392 — clear, container deletes, multi-selection deletes and delete+compact ask; a single element does not", () => {
    expect(needsConfirmation([{ op: "clear" }], els)?.what).toBe("clear the whole diagram (4 elements)");
    expect(needsConfirmation([{ op: "clear" }], []), "nothing to lose → no question").toBeNull();
    expect(needsConfirmation([{ op: "delete", ref: "Pick", compact: true }], els)?.what).toBe("delete Pick and close the gap");
    // 2026-09-21: the count is now the real contents ANYWHERE below it, and
    // the wording says they are KEPT — which is what the reducer has always
    // done. "The 1 element inside it" was the lane, true of nothing the user
    // can see, while the two tasks they actually care about went unmentioned;
    // and "and the …" read as a threat to delete them (Paul said no to a
    // sub-lane delete because of it).
    expect(needsConfirmation([{ op: "delete", ref: "Warehouse" }], els)?.what).toBe("delete the pool “Warehouse” — the 2 elements inside it will be kept");
    expect(needsConfirmation([{ op: "delete", ref: "Sales" }], els)?.what).toBe("delete the lane “Sales” — the 2 elements inside it will be kept");
    expect(needsConfirmation([{ op: "delete", ref: "these" }], els, null, ["t1", "t2"])?.what).toBe("delete the 2 selected elements");
    expect(needsConfirmation([{ op: "delete", ref: "Pick" }], els), "one named task deletes at once").toBeNull();
    expect(needsConfirmation([{ op: "rename", ref: "Pick", label: "Pick Items" }], els)).toBeNull();

    expect(parseConfirmation("yes")).toBe("yes");
    expect(parseConfirmation("Yes please.")).toBe("yes");
    expect(parseConfirmation("go ahead")).toBe("yes");
    expect(parseConfirmation("no")).toBe("no");
    expect(parseConfirmation("never mind")).toBe("no");
    expect(parseConfirmation("add a task called Ship")).toBeNull();

    const run = callbackBody(editor(), "runVoiceCommand");
    expect(run).toContain("if (pendingConfirmRef.current) {");
    expect(run).toContain("needsConfirmation(ops, data.elements, voiceLastId.current, selectedIdsRef.current)");
    expect(run, "the parked ops are applied only on a yes").toMatch(/if \(answer === "yes"\) \{\s*const r = applyGrouped\(pending\.ops\);/);
  });
});

describe("M1 — the selection is a reference: the mouse says which, the voice says what", () => {
  const els = [el("p", "pool", "Warehouse"), el("t1", "task", "Review"), el("t2", "task", "Review"), el("g", "gateway", "Ok?")];

  it("T4393 — this / these / the selected <kind> resolve to the selection; nothing selected falls back", () => {
    // One task selected: every phrasing lands on it, including the ambiguous name.
    expect(resolveRef("the selected task", els, null, ["t1"])).toEqual({ id: "t1" });
    expect(resolveRef("this", els, null, ["t1"])).toEqual({ id: "t1" });
    expect(resolveRef("these", els, null, ["t1"])).toEqual({ id: "t1" });
    expect(resolveRef("the selection", els, null, ["t1"])).toEqual({ id: "t1" });
    expect(resolveRef("Review", els, null, ["t1"]), "a NAME is still resolved by name").toEqual({ ambiguous: ["t1", "t2"] });

    // Two selected: a single-target ref is ambiguous (the caller says "select just one");
    // a kind filter narrows it; the multi resolver returns them all.
    expect(resolveRef("these", els, null, ["t1", "g"])).toEqual({ ambiguous: ["t1", "g"] });
    expect(resolveRef("the selected gateway", els, null, ["t1", "g"])).toEqual({ id: "g" });
    expect(resolveRef("the selected pool", els, null, ["t1", "g"]), "no pool is selected").toBeNull();
    expect(resolveSelectionRefs("the selected tasks", els, ["t1", "t2", "g"])).toEqual(["t1", "t2"]);
    expect(resolveSelectionRefs("these", els, ["t1", "zzz"]), "stale ids are dropped").toEqual(["t1"]);

    // Nothing selected: "this" keeps its old meaning (the last one added);
    // "these" is a selection word and resolves to nothing.
    expect(resolveRef("this", els, "g", [])).toEqual({ id: "g" });
    expect(resolveRef("these", els, "g", [])).toBeNull();
    expect(resolveSelectionRefs("this", els, [])).toBeNull();
    expect(resolveSelectionRefs("Review", els, ["t1"])).toBeNull();

    expect(isSelectionRef("the selected task")).toBe(true);
    expect(isSelectionRef("these")).toBe(true);
    expect(isSelectionRef("Review")).toBe(false);
    expect(isSelectionRef("this"), "bare this is only a selection ref when something is selected").toBe(false);

    // The AI sees the selection too, so its canonical rewrite can keep "this".
    const data = { elements: els, connectors: [] } as unknown as DiagramData;
    const text = serializeDiagramForCommand(data, ["g"]);
    expect(text).toContain('g [gateway] "Ok?" [selected]');
    expect(text).not.toContain('t1 [task] "Review" [selected]');
  });
});
