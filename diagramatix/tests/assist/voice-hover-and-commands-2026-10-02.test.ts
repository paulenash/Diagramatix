/**
 * T5216 — the twelve points Paul raised on 2026-10-02 against Voice Assist Help and the commands:
 *   1/11/12  Assist's own words (use … / take) only while Assist is ACTIVE; “take” shows then
 *   2        the hover outline is only ever what the cursor is really over (no stale target)
 *   3        connectors and event / message / gateway labels are hover targets
 *   4/5/6    a lane and a white-box pool are hovered only on their HEADER; a black-box pool as before
 *   7        compress also fits an expanded subprocess's height
 *   8        surround: a name that repeats gets a loop marker; the name is capitalised
 *   9        Cost and Debug are SuperAdmin only; debug is off by default
 *   10       “unwrap”, “convert to …” and “compress” work on the hovered thing, with no target said
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultCommandTree, targetNow } from "@/app/lib/assist/commandTree";
import { elementUnderPointer, hoverConnectorAt } from "@/app/lib/assist/pointerRef";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { isVoiceDebugOn } from "@/app/lib/assist/voiceDebug";
import { externalLabelBox } from "@/app/lib/diagram/textMetrics";
import { planCompressEp } from "@/app/lib/diagram/epCompress";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");
const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;
const flow = (id: string, s: string, t: string, waypoints: Array<{ x: number; y: number }> = [], extra: Partial<Connector> = {}): Connector =>
  ({ id, sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints, sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5, ...extra }) as Connector;

const tree = defaultCommandTree();

describe("T5216 1 / 11 / 12  Assist's own words only while Assist is active", () => {
  const shown = (ghost: boolean) => tree.firstWordGroups({ ghost }).flatMap((g) => [g.main, ...g.aliases]);
  it("use, pick, choose, open and show are not listed with Assist off", () => {
    for (const w of ["use", "pick", "choose", "open", "show"]) expect(shown(false), w).not.toContain(w);
  });
  it("…and are listed with Assist on, with accept / take", () => {
    for (const w of ["use", "pick", "choose", "accept", "take"]) expect(shown(true), w).toContain(w);
  });
  it("“add template” is still there with Assist off — it is an add", () => {
    expect(shown(false)).toContain("add");
    expect(tree.accepts("add template")).toBe(true);
  });
  it("the editor says Assist is ACTIVE by its toggle — not by a suggestion happening to be on screen", () => {
    expect(read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain("ghost: assistEnabled, flow: helpOpenFlow, names: helpNames,");
  });
});

describe("T5216 4 / 5 / 6  what the pointer is over: headers only", () => {
  const els = [
    el("bb", "pool", 0, 0, 400, 100, "Customer", undefined, { properties: { poolType: "black-box" } }),
    el("wb", "pool", 0, 150, 800, 300, "Process"),
    el("l1", "lane", 36, 150, 764, 150, "Intake", "wb"),
    el("l2", "lane", 36, 300, 764, 150, "Pay", "wb"),
    el("sub", "lane", 72, 300, 728, 75, "Sub", "l2"),
  ];
  it("a BLACK-BOX pool is the target anywhere over it (as it was)", () => {
    expect(elementUnderPointer({ x: 200, y: 50 }, els)?.id).toBe("bb");
    expect(elementUnderPointer({ x: 10, y: 50 }, els)?.id).toBe("bb");
  });
  it("a WHITE-BOX pool only over its header strip", () => {
    expect(elementUnderPointer({ x: 10, y: 250 }, els)?.id).toBe("wb");
    expect(elementUnderPointer({ x: 500, y: 250 }, els)?.id, "its body is a lane's, not the pool's").not.toBe("wb");
  });
  it("a LANE only over its header; its body is over nothing", () => {
    expect(elementUnderPointer({ x: 50, y: 200 }, els)?.id).toBe("l1");
    expect(elementUnderPointer({ x: 500, y: 200 }, els)).toBeNull();
  });
  it("a SUB-LANE only over its header", () => {
    expect(elementUnderPointer({ x: 90, y: 330 }, els)?.id).toBe("sub");
    expect(elementUnderPointer({ x: 500, y: 330 }, els)).toBeNull();
  });
  it("a task in a lane is still found over its body", () => {
    expect(elementUnderPointer({ x: 300, y: 200 }, [...els, el("t", "task", 250, 170, 102, 64, "Do", "l1")])?.id).toBe("t");
  });
});

describe("T5216 3  event, gateway and connector labels are hover targets", () => {
  it("an event's label is its event; a gateway's label is its gateway", () => {
    for (const [type, label] of [["start-event", "Claim received"], ["end-event", "Closed"], ["intermediate-event", "Wait"], ["gateway", "In stock?"]] as const) {
      const e = el("e", type, 400, 300, type === "gateway" ? 40 : 36, type === "gateway" ? 40 : 36, label);
      const b = externalLabelBox(e)!;
      expect(b, type).toBeTruthy();
      expect(elementUnderPointer({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, [e])?.id, `${type} label`).toBe("e");
    }
  });
  it("away from the shape and its label: nothing", () => {
    expect(elementUnderPointer({ x: 900, y: 900 }, [el("e", "start-event", 400, 300, 36, 36, "Claim received")])).toBeNull();
  });
  const a = el("a", "task", 0, 0, 100, 60, "A"), b = el("b", "task", 300, 0, 100, 60, "B");
  const c = flow("c", "a", "b", [{ x: 100, y: 30 }, { x: 300, y: 30 }]);
  it("a connector is hovered on its line (within 6 px), not beside it", () => {
    expect(hoverConnectorAt({ x: 200, y: 34 }, [a, b], [c])?.id).toBe("c");
    expect(hoverConnectorAt({ x: 200, y: 41 }, [a, b], [c])).toBeNull();
    expect(hoverConnectorAt(null, [a, b], [c])).toBeNull();
  });
  it("a connector is hovered on its LABEL (a message's name, a flow's condition)", () => {
    const m = flow("m", "a", "b", [{ x: 100, y: 30 }, { x: 300, y: 30 }], { type: "messageBPMN", label: "Order placed" } as Partial<Connector>);
    // the label sits off the line: find it by looking where the label box is
    let hit: { x: number; y: number } | null = null;
    for (let y = -60; y <= 100 && !hit; y += 2) for (let x = 100; x <= 300 && !hit; x += 4) if (hoverConnectorAt({ x, y }, [a, b], [m]) && Math.abs(y - 30) > 8) hit = { x, y };
    expect(hit, "some point off the line but on the label finds the message").toBeTruthy();
  });
  it("a connector attached to an expanded subprocess is NOT hovered inside it (its route runs on to the centre)", () => {
    const ep = el("ep", "subprocess-expanded", 300, 0, 300, 160, "EP");
    const k = flow("k", "a", "ep", [{ x: 100, y: 30 }, { x: 450, y: 30 }]);
    expect(hoverConnectorAt({ x: 200, y: 30 }, [a, ep], [k])?.id, "outside the EP").toBe("k");
    expect(hoverConnectorAt({ x: 400, y: 30 }, [a, ep], [k]), "inside the EP").toBeNull();
  });
  it("the target line names a hovered connector, once nothing is selected and no element is in front", () => {
    const t = targetNow([a, b], [], null, { x: 200, y: 34 }, null, { id: "c", type: "sequence", sourceId: "a", targetId: "b" });
    expect(t.kind).toBe("cursor");
    expect(t.connectorId).toBe("c");
    expect(t.label).toContain("sequence connector");
    expect(targetNow([a, b], ["a"], null, { x: 200, y: 34 }, null, { id: "c", type: "sequence", sourceId: "a", targetId: "b" }).kind).toBe("selected");
    expect(targetNow([a, b], [], null, { x: 50, y: 30 }, null, { id: "c", type: "sequence", sourceId: "a", targetId: "b" }).connectorId, "an element in front wins").toBeUndefined();
  });
  it("it is wired: the hook's “this” connector is the selected one, else the hovered one; the pointer is cleared on leaving the canvas", () => {
    const hook = read("app/hooks/useVoiceSession.ts");
    expect(hook).toContain("const effectiveConnectorRef = useMemo");
    expect(hook).toContain("hoverConnectorAt(at, host.elementsRef.current, host.connectorsRef.current)");
    expect(hook).toContain("selectedConnectorIdRef: effectiveConnectorRef");
    expect(read("app/components/canvas/Canvas.tsx")).toContain("onPointerLeave={() => { onPointerWorld?.(null); }}");
    expect(read("app/components/canvas/Canvas.tsx")).toContain("data-voice-target-path");
  });
});

describe("T5216 2  the outline is only what the cursor is really over", () => {
  it("a stale target cannot stay lit: outline only for kind 'cursor'; the last-added fallback is not outlined", () => {
    const e = el("a", "task", 100, 100, 100, 60, "Review");
    expect(targetNow([e], [], "a", { x: 900, y: 900 }).kind, "cursor on empty canvas → the last one added, which is not outlined").toBe("last");
    expect(targetNow([e], [], null, { x: 120, y: 120 }).kind).toBe("cursor");
    expect(read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain('if (!helpActive || helpTarget.kind !== "cursor" || !helpTarget.id) return null;');
  });
});

describe("T5216 7  compress fits an expanded subprocess's height", () => {
  const world = (): DiagramData => ({
    ...EMPTY_DIAGRAM,
    elements: [el("pool", "pool", 0, 0, 900, 420, "P"), el("lane", "lane", 36, 0, 864, 420, "L", "pool"),
      el("ep", "subprocess-expanded", 100, 40, 400, 300, "Settle Claim", "lane"), el("t", "task", 150, 100, 102, 64, "Do", "ep")],
    connectors: [],
  });
  const run = (s: string, opts: { selected?: string[]; pointer?: { x: number; y: number } | null } = {}) => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand(s)!, h.context({ selectedIds: opts.selected ?? [], pointer: opts.pointer ?? null }));
    return { r, ep: h.data.elements.find((e) => e.id === "ep")! };
  };
  it("BOTH edges come in: the top down to just above the highest thing (leaving the label band), the bottom up to just below the lowest — the contents do not move", () => {
    const { r, ep } = run("compress Settle Claim");
    expect(r.ok, r.summary).toBe(true);
    expect(ep.y).toBe(100 - 36);                       // the task's top, less the label band
    expect(ep.y + ep.height).toBe(100 + 64 + 24);      // the task's bottom, plus the bottom padding
    expect(ep.width).toBe(400);
  });
  it("an edge only ever moves INWARD: content already close to an edge is not pushed out", () => {
    const d = world();
    const ep = d.elements.find((e) => e.id === "ep")!;
    const t = d.elements.find((e) => e.id === "t")!;
    t.y = ep.y + 10;                                  // nearer the top than the label band wants
    const plan = planCompressEp(d.elements, ep);
    expect("y" in plan && plan.y).toBe(ep.y);          // the top stays
  });
  it("a bare “compress” / “shrink” means this — selected, or under the cursor", () => {
    expect(run("compress", { selected: ["ep"] }).ep.height).toBeLessThan(300);
    expect(run("shrink", { pointer: { x: 480, y: 320 } }).ep.height).toBeLessThan(300);   // the EP's empty corner
  });
  it("already fitted, or empty, says so and changes nothing", () => {
    const d = world();
    const fitted = planCompressEp(d.elements, { ...d.elements[2], y: 64, height: 124 });
    expect("error" in fitted && fitted.error).toContain("already fitted");
    const empty = planCompressEp(d.elements.filter((e) => e.id !== "t"), d.elements[2]);
    expect("error" in empty && empty.error).toContain("empty");
  });
  it("pool and lane compress still work (the same command)", () => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand("compress the lane")!, h.context({ selectedIds: ["lane"] }));
    expect(r.ok, r.summary).toBe(true);
  });
  it("a bare compress is a whole command — it is not held for the rest", () => {
    expect(isIncompleteCommand("compress")).toBe(false);
    expect(isIncompleteCommand("shrink")).toBe(false);
  });
});

describe("T5216 8  surround: loop marker from the name, and the name is capitalised", () => {
  const world = (): DiagramData => ({
    ...EMPTY_DIAGRAM,
    elements: [
      el("P", "pool", 0, 0, 1200, 200, "Warehouse"), el("L1", "lane", 36, 0, 1164, 200, "Picking", "P"),
      el("S", "start-event", 80, 82, 36, 36, "", "L1"), el("A", "task", 150, 70, 102, 65, "Receive", "L1"),
      el("B", "task", 300, 70, 102, 65, "Pick", "L1"), el("C", "task", 450, 70, 102, 65, "Check", "L1"), el("E", "end-event", 610, 82, 36, 36, "", "L1"),
    ],
    connectors: [flow("c0", "S", "A"), flow("c1", "A", "B"), flow("c2", "B", "C"), flow("c3", "C", "E")],
  });
  const surround = (name: string) => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand(`surround selected with an expanded subprocess called ${name}`)!, h.context({ selectedIds: ["B"] }));
    const ep = h.data.elements.find((e) => e.type === "subprocess-expanded");
    return { r, ep: ep as (DiagramElement & { repeatType?: string }) | undefined };
  };
  it("“repeat …” → a loop marker", () => {
    const { r, ep } = surround("repeat until approved");
    expect(r.ok, r.summary).toBe(true);
    expect(ep?.repeatType).toBe("loop");
  });
  it("“do until …” and “do while …” → a loop marker", () => {
    expect(surround("do until stock arrives").ep?.repeatType).toBe("loop");
    expect(surround("do while stock remains").ep?.repeatType).toBe("loop");
  });
  it("any other name gets none", () => {
    expect(surround("check stock").ep?.repeatType ?? "none").toBe("none");
  });
  it("the name is capitalised (first word, as an activity's is)", () => {
    expect(surround("check stock").ep?.label).toBe("Check stock");
    expect(surround("repeat until approved").ep?.label).toBe("Repeat until approved");
  });
  it("the log says why a loop marker was added", () => {
    expect(surround("repeat until approved").r.summary).toContain("loop marker");
    expect(surround("check stock").r.summary).not.toContain("loop marker");
  });
});

describe("T5216 9  Cost and Debug: SuperAdmin only; debug off by default", () => {
  it("the Cost button needs a SuperAdmin; so does the debug toggle", () => {
    const bar = read("app/components/canvas/VoiceAssistBar.tsx");
    expect(bar).toContain("{isSuperAdmin && onCost && (");
    expect(bar).toContain("{isSuperAdmin && onToggleDebug && (");
  });
  it("debug recording is off for anyone the editor does not allow, whatever is stored", () => {
    const hook = read("app/hooks/useVoiceSession.ts");
    expect(hook).toContain("const debugAllowed = host.debugAllowed !== false;");
    expect(hook).toContain("setVoiceDebugRecording(debugAllowed ? isVoiceDebugOn() : false)");
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("debugAllowed: isActingAdmin,");
    expect(editor).toContain("debugOn={voiceDebugRecording && isActingAdmin}");
    expect(editor).toContain("onToggleDebug={isActingAdmin ?");
  });
  it("and it is OFF by default (nothing stored, or anything but “on”)", () => {
    expect(isVoiceDebugOn({ getItem: () => null })).toBe(false);
    expect(isVoiceDebugOn({ getItem: () => "garbage" })).toBe(false);
  });
});

describe("T5216 10  commands with no target act on the hovered thing", () => {
  const world = (): DiagramData => ({
    ...EMPTY_DIAGRAM,
    elements: [
      el("pool", "pool", 0, 0, 900, 420, "P"), el("lane", "lane", 36, 0, 864, 420, "L", "pool"),
      el("ep", "subprocess-expanded", 100, 40, 400, 200, "Settle Claim", "lane"),
      el("s", "start-event", 124, 120, 36, 36, "", "ep"), el("k", "task", 190, 106, 102, 64, "Do", "ep"), el("x", "end-event", 322, 120, 36, 36, "", "ep"),
      el("t", "task", 600, 100, 102, 64, "Review", "lane"),
    ],
    connectors: [flow("f1", "s", "k"), flow("f2", "k", "x")],
  });
  it("hovering an expanded subprocess: “unwrap” (and its aliases) dissolve it", () => {
    for (const verb of ["unwrap", "dissolve", "unpack", "flatten"]) {
      const h = headlessDiagram(world());
      const r = applyAssistOps(parseCommand(verb)!, h.context({ selectedIds: [], pointer: { x: 480, y: 225 } }));   // the EP's empty corner
      expect(r.ok, `${verb}: ${r.summary}`).toBe(true);
      expect(h.data.elements.some((e) => e.id === "ep"), verb).toBe(false);
    }
  });
  it("hovering something INSIDE an expanded subprocess unwraps the one around it", () => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand("unwrap")!, h.context({ selectedIds: [], pointer: { x: 240, y: 138 } }));   // over the task inside
    expect(r.ok, r.summary).toBe(true);
    expect(h.data.elements.some((e) => e.id === "ep")).toBe(false);
  });
  it("nothing selected and nothing under the cursor: it says to select or point", () => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand("unwrap")!, h.context({ selectedIds: [], pointer: { x: 800, y: 380 } }));
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("select or point at");
  });
  it("hovering a task: “convert to a subprocess” converts it", () => {
    expect(parseCommand("convert to a subprocess")).toEqual([{ op: "convertActivity", ref: "this", to: "subprocess" }]);
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand("convert to a subprocess")!, h.context({ selectedIds: [], pointer: { x: 650, y: 130 } }));
    expect(r.ok, r.summary).toBe(true);
    expect(h.data.elements.find((e) => e.id === "t")?.type).toBe("subprocess");
  });
  it("the same with the other verbs", () => {
    for (const s of ["turn into a subprocess", "change to a subprocess"]) expect(parseCommand(s), s).toEqual([{ op: "convertActivity", ref: "this", to: "subprocess" }]);
    expect(parseCommand("convert to a task")).toEqual([{ op: "convertActivity", ref: "this", to: "task" }]);
    // a marker conversion with no target still reads as THIS
    expect(parseCommand("convert to a user task")).toEqual([{ op: "convert", ref: "this", subtype: "user task" }]);
  });
  it("the forms that name a target are untouched", () => {
    expect(parseCommand("convert Review to a subprocess")).toEqual([{ op: "convertActivity", ref: "Review", to: "subprocess" }]);
    expect(parseCommand("unwrap the selected subprocess")).toEqual([{ op: "unwrapSubprocess" }]);
  });
});
