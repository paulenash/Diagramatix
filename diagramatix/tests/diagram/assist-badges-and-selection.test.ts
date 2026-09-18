/**
 * Paul, 2026-09-15: where the green numbers sit, and that a rename or move by
 * voice never leaves the item selected.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { badgePlaceFor, collectRenameTargets } from "@/app/lib/assist/renameTargets";
import { collectMessageTargets } from "@/app/lib/assist/messageTargets";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");
const el = (id: string, type: string, label = "", extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });

describe("where the green numbers sit", () => {
  it("T4408 — activities below, events above, pools and lanes in the header; every collector says so", () => {
    expect(badgePlaceFor("task")).toBe("below");
    expect(badgePlaceFor("subprocess")).toBe("below");
    expect(badgePlaceFor("gateway")).toBe("below");
    for (const t of ["start-event", "intermediate-event", "end-event"]) expect(badgePlaceFor(t), t).toBe("above");
    expect(badgePlaceFor("pool")).toBe("header");
    expect(badgePlaceFor("lane")).toBe("header");

    const els = [
      el("p", "pool", "Warehouse", { properties: { poolType: "black-box" } }),
      el("l", "lane", "Sales", { parentId: "p" }),
      el("t", "task", "Pick", { parentId: "l" }),
      el("s", "start-event", "Go", { parentId: "l", width: 40, height: 40 }),
    ];
    const place = (targets: { id: string; place?: string }[], id: string) => targets.find((x) => x.id === id)?.place;
    expect(place(collectRenameTargets(els, [], "event"), "s")).toBe("above");
    expect(place(collectRenameTargets(els, [], "task"), "t")).toBe("below");
    expect(place(collectRenameTargets(els, [], "pool"), "p")).toBe("header");
    expect(place(collectRenameTargets(els, [], "lane"), "l")).toBe("header");
    const msg = collectMessageTargets(els, null);
    expect("targets" in msg && place(msg.targets, "p")).toBe("header");
    expect("targets" in msg && place(msg.targets, "t")).toBe("below");
  });

  it("T4409 — the canvas honours the place: above for events, and in the header BEFORE the name for pools and lanes, measuring the name", () => {
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).toContain('if (b.place === "above") return { x: b.x, y: b.y - b.height / 2 - 16 / zoom };');
    expect(canvas).toContain('if (b.place === "header") {');
    // The name is rotated -90° about (cx, cy) and centred, so its START is cy + width/2:
    // the badge goes just beyond that, at the header's centre x — SymbolRenderer's cx.
    expect(canvas).toContain("return { x: e.x + LW / 2 + 3, y: e.y + e.height / 2 + nameW / 2 + 6 + 13 / zoom };");
    expect(canvas, "measured, so it moves with the name's length").toContain("measureHeaderLabel(l, fs)");
    expect(canvas, "in the face the header is drawn in").toMatch(/measureHeaderLabel[\s\S]*?-apple-system, BlinkMacSystemFont, 'Segoe UI'/);
    expect(canvas).toContain("place?: \"below\" | \"above\" | \"header\" }>;");
  });
});

describe("the selection protocol", () => {
  it("T4410 — a rename or move by voice never leaves the item selected", () => {
    const ed = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    // Rename by number: after the name is applied, selection and connector selection are cleared.
    expect(ed).toMatch(/cancelLabelEdit\(\);\s*\/\/[^\n]*\n[^\n]*\n\s*setSelectedElementIds\(new Set\(\)\);\s*setSelectedConnectorId\(null\);/);
    // Plain rename, move, nudge and lane move all end with nothing selected.
    expect(ed).toMatch(/updateLabel\(e\.id, newLabel\); els = withLabel\(els, e\.id, newLabel\); setSelectedElementIds\(new Set\(\)\);/);
    expect(ed).toMatch(/elementsMoveEnd\(\);[^\n]*\n\s*setSelectedElementIds\(new Set\(\)\); \/\/ selection protocol: a voice move leaves nothing selected/);
    expect(ed).toMatch(/elementsMoveEnd\(\); \/\/ commit the nudge as its own undo entry\s*setSelectedElementIds\(new Set\(\)\);/);
    expect(ed).toMatch(/moveLane\(r\.id, op\.direction, op\.distance \?\? 32\);\s*voiceLastId\.current = r\.id;\s*setSelectedElementIds\(new Set\(\)\);/);
  });
});
