/**
 * T4721–T4722 — the snapshot's framing maths, and the session file.
 *
 * Paul, 2026-09-24, asked for a snapshot beside a command, capturing both the
 * diagram JSON and a picture. The picture was produced by the code the SOP
 * generator already used — extracted rather than re-invented, because that one
 * carries a hard-won comment: html-to-image's `toPng` on a bare `<svg>` "fails
 * silently and left SOPs with no figure". On 2026-09-26 he reversed the picture
 * half ("JSON, not SVG"): the SOP figure keeps this code, and a snapshot is now
 * the diagram as JSON (tests/diagram/voice-debug-json-snapshots.test.ts).
 *
 * Only the framing maths is tested here. The rasterising half is DOM and this
 * suite has no jsdom; it is kept deliberately thin for that reason, with
 * everything decidable moved out into the functions below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contentBounds, fitOutputSize } from "@/app/lib/diagram/canvasSnapshot";
import {
  buildDebugSessionFile, debugSessionFilename, parseDebugSession,
  serialiseDebugSession, sessionCounts, DEBUG_SESSION_FORMAT,
} from "@/app/lib/assist/debugSessionFile";
import type { CommandLogEntry } from "@/app/lib/assist/commandLog";

describe("T4721 — what the picture is framed around", () => {
  it("wraps every element, with the margin on all four sides", () => {
    const b = contentBounds([
      { x: 100, y: 50, width: 100, height: 60 },
      { x: 400, y: 200, width: 80, height: 40 },
    ], 30)!;
    expect(b).toEqual({ x: 70, y: 20, w: (480 - 100) + 60, h: (240 - 50) + 60 });
  });

  it("an empty diagram has NO bounds, and says so", () => {
    // Not a degenerate rectangle: fitOutputSize would divide by its zero width
    // and the caller would get NaN pixels instead of "there is nothing to draw".
    expect(contentBounds([], 30)).toBeNull();
    expect(contentBounds([{ x: 0, y: 0, width: 0, height: 0 }], 30), "zero-size elements do not count").toBeNull();
  });

  it("ignores zero-size elements rather than letting them drag the frame", () => {
    // A connector label or a placeholder at the origin would otherwise pull the
    // frame back to 0,0 and shrink the diagram into one corner.
    const b = contentBounds([
      { x: 500, y: 500, width: 100, height: 100 },
      { x: 0, y: 0, width: 0, height: 0 },
    ], 10)!;
    expect(b.x).toBe(490);
    expect(b.y).toBe(490);
  });

  it("a single element still frames correctly", () => {
    expect(contentBounds([{ x: 10, y: 10, width: 100, height: 50 }], 5))
      .toEqual({ x: 5, y: 5, w: 110, h: 60 });
  });

  it("output size clamps the width and keeps the aspect ratio", () => {
    // Aspect must come from the ORIGINAL bounds, not the clamped width, or a
    // very wide diagram comes back squashed.
    const wide = fitOutputSize({ x: 0, y: 0, w: 4000, h: 1000 }, 1400);
    expect(wide.outW).toBe(1400);
    expect(wide.outH).toBe(350);
    expect(wide.outW / wide.outH).toBeCloseTo(4000 / 1000, 5);

    const small = fitOutputSize({ x: 0, y: 0, w: 120, h: 240 }, 1400, 320);
    expect(small.outW, "clamped up to the minimum").toBe(320);
    expect(small.outH, "and still the right shape").toBe(640);

    const ordinary = fitOutputSize({ x: 0, y: 0, w: 800, h: 600 });
    expect(ordinary).toEqual({ outW: 800, outH: 600 });
  });

  it("never returns a zero height", () => {
    expect(fitOutputSize({ x: 0, y: 0, w: 4000, h: 1 }, 400).outH).toBeGreaterThanOrEqual(1);
  });

  it("the SOP generator uses this same code, so one fix fixes both", () => {
    const sop = readFileSync("app/(dashboard)/diagram/[id]/SopGenerateDialog.tsx", "utf8");
    expect(sop, "imports the shared module").toContain('from "@/app/lib/diagram/canvasSnapshot"');
    expect(sop, "and no longer carries its own copy").not.toMatch(/async function svgToPng\(/);
    expect(sop).not.toMatch(/function stripSelectionChrome\(/);
  });
});

describe("T4722 — a session file round-trips", () => {
  const entries: CommandLogEntry[] = [
    { id: "1", heard: "add a task called Approve", summary: "added Approve", ok: true, at: 1_700_000_000_000, verdict: "worked" },
    { id: "2", heard: "put it in the second lane", summary: "moved Approve", ok: true, at: 1_700_000_001_000, verdict: "wrong", note: "went into lane 3" },
    { id: "3", heard: "delete the gateway", summary: "couldn't find a gateway", ok: false, at: 1_700_000_002_000 },
  ];
  const snapshots = [{
    id: "s1", entryId: "2", takenAt: 1_700_000_001_500, png: "data:image/png;base64,AAAA",
    width: 800, height: 600, diagramJson: { elements: [{ id: "a" }], connectors: [] },
    elementCount: 1, connectorCount: 0,
  }];

  const file = () => buildDebugSessionFile({
    title: "Voice Assist — Order to Cash",
    diagramId: "d1", diagramName: "Order to Cash",
    entries, snapshots, savedAt: 1_700_000_003_000, appVersion: "2.12",
  });

  it("survives being written and read back", () => {
    const back = parseDebugSession(serialiseDebugSession(file()));
    expect(back).toEqual(file());
  });

  it("carries the comments, the verdicts and the picture", () => {
    const back = parseDebugSession(serialiseDebugSession(file()))!;
    expect(back.entries[1].note, "the comment is the point of the file").toBe("went into lane 3");
    expect(back.entries[1].verdict).toBe("wrong");
    expect(back.snapshots[0].png, "the picture travels inline, so it is one file").toContain("data:image/png;base64,");
    expect(back.snapshots[0].diagramJson, "and the diagram behind it, so it can be replayed").toBeTruthy();
    expect(back.diagram).toEqual({ id: "d1", name: "Order to Cash" });
  });

  it("counts the failures and the disputes separately", () => {
    expect(sessionCounts(entries)).toEqual({ entryCount: 3, failureCount: 1, disputeCount: 1 });
  });

  it("refuses a file that is not one of ours, rather than half-loading it", () => {
    expect(parseDebugSession("not json at all")).toBeNull();
    expect(parseDebugSession(JSON.stringify({ hello: "world" })), "a plain .json is not a session").toBeNull();
    expect(parseDebugSession(JSON.stringify({ format: DEBUG_SESSION_FORMAT })), "no entries").toBeNull();
    // …but a session with no snapshots is perfectly valid.
    const noShots = parseDebugSession(JSON.stringify({ format: DEBUG_SESSION_FORMAT, entries: [] }));
    expect(noShots?.snapshots).toEqual([]);
  });

  it("names the file after the diagram and the day", () => {
    expect(debugSessionFilename("Order to Cash", "2026-09-24T06:00:00.000Z"))
      .toBe("Order-to-Cash-voice-debug-2026-09-24.dgx-voice.json");
    expect(debugSessionFilename(null, "2026-09-24T06:00:00.000Z"))
      .toBe("diagram-voice-debug-2026-09-24.dgx-voice.json");
    expect(debugSessionFilename("A/B: “quoted”", "2026-09-24T06:00:00.000Z"), "no path characters survive")
      .toMatch(/^A-B-quoted-voice-debug-2026-09-24\.dgx-voice\.json$/);
  });
});

describe("T4722b — the bar and the editor are actually wired to all of it", () => {
  // Source-level, because the wiring lives in .tsx and this suite has no jsdom.
  const bar = () => readFileSync("app/components/canvas/VoiceAssistBar.tsx", "utf8");
  const editor = () => readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");

  it("the log entry type lives in the lib, and the bar re-exports it", () => {
    expect(bar()).toContain('export type { CommandLogEntry, CommandVerdict } from "@/app/lib/assist/commandLog"');
    expect(bar(), "the shape is not declared twice").not.toMatch(/export interface CommandLogEntry \{/);
  });

  it("the debug row is SuperAdmin-only", () => {
    const b = bar();
    expect(b).toContain("isSuperAdmin && onToggleDebug");
    expect(b, "the annotation row too").toContain("debugOn && isSuperAdmin");
  });

  it("the editor arms the debug diff on EVERY command, not only the flashing ones", () => {
    // batchFlashes deliberately skips the ops that change nothing worth
    // outlining — and those are exactly the ones a person cannot check by
    // looking, so they are the ones the evidence needs most.
    const e = editor();
    expect(e).toContain("if (voiceDebugRecording) {");
    expect(e).toMatch(/if \(batchFlashes\(ops\)\) armGoldFlash\(data\.elements\);/);
    expect(e, "the two are armed independently").not.toMatch(/batchFlashes\(ops\)[^\n]*voiceDebugRecording/);
  });

  it("every log entry is stamped with a time, recording or not", () => {
    // One helper for every line since 2026-09-26 (T4892): a dozen direct
    // appends had skipped the time.
    expect(editor()).toContain("{ id: nanoid(), at: Date.now(), ...entry, ...(ops ? { ops } : {}) }");
  });

  it("a snapshot is the diagram as JSON — no picture is taken", () => {
    // CHANGED BY DESIGN, 2026-09-26. This pinned "a snapshot keeps the diagram
    // even when the picture fails" (PNG + { elements, connectors }). Paul: "Make
    // the snapshots in Voice Assist JSON, not SVG. These can be better used for
    // diagnosis." The picture is gone; the JSON is the whole DiagramData with
    // what was on screen (T4886), saved through the capture ledger (T4887).
    const e = editor();
    const fn = e.slice(e.indexOf("const takeDebugSnapshot"), e.indexOf("const downloadDebugSession"));
    expect(fn).toContain('saveDebugStateRef.current(data, "marked", entryId)');
    expect(fn, "no picture").not.toMatch(/captureCanvasPng|png:/);
    expect(e).toContain("const r = captureState(debugLedgerRef.current, state, {");
  });
});
