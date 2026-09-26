/**
 * T4886–T4893, T4895–T4897 — Voice Assist debug snapshots are the diagram as JSON.
 *
 * Paul, 2026-09-26: "Make the snapshots in Voice Assist JSON, not SVG. These can
 * be better used for diagnosis." Nothing SVG was ever stored: a snapshot was a
 * PNG plus `{ elements, connectors }`, and the PNG was 78–89 % of every file.
 * It reverses his 24 Sep decision (JSON *and* a PNG). His answers of the same
 * day settle the rest: save AUTOMATICALLY while recording (Q1), and draw a
 * snapshot in the viewer with the editor's own read-only canvas (Q4).
 *
 * The policy lives in `app/lib/assist/debugCapture.ts` and the file shape in
 * `debugSessionFile.ts`, both pure, so most of this is behaviour; the editor
 * and the viewer are `.tsx` in a node-only suite, so their WIRING is checked as
 * source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTO_CAPTURE_LIMIT_BYTES, badgesOnScreen, captureState, captureStoppedSummary, newCaptureLedger, projectFlow, settleArm,
  type ArmedCapture, type CaptureLedger, type OpenFlows,
} from "@/app/lib/assist/debugCapture";
import {
  buildDebugSessionFile, parseDebugSession, readSnapshotDiagram, serialiseDebugSession, snapshotDiagramFile,
  snapshotFilename, snapshotPicture, SNAPSHOT_SHAPE_VERSION,
  type DebugSnapshot, type SnapshotRole, type VoiceDebugMeta, type VoiceDebugUi,
} from "@/app/lib/assist/debugSessionFile";
import { serialiseEnvelope, singleDiagramEnvelope } from "@/app/lib/diagram/exportEnvelope";
import { checkSchemaCompatibility, SCHEMA_VERSION, type DiagramData } from "@/app/lib/diagram/types";
import type { RenameTarget } from "@/app/lib/assist/renameTargets";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const EDITOR = () => src("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
const VIEWER = () => src("app", "(dashboard)", "dashboard", "admin", "voice-debug", "VoiceDebugClient.tsx");
const DRAWER = () => src("app", "(dashboard)", "dashboard", "admin", "voice-debug", "SnapshotCanvas.tsx");

/** Paul's Block 2 Test 3 diagram — snapshot qe8reyjr's diagramJson, byte for byte (shape 1). */
const PAUL = () => JSON.parse(src("tests", "fixtures", "block2-test3-add-message.json")) as DiagramData;
const PICK_ITEMS = "xjh97pr0";

const noUi = (over: Partial<VoiceDebugUi> = {}): VoiceDebugUi => ({
  selectedIds: [], selectedConnectorId: null, pointer: null, voiceLastId: null, badges: null, flow: null, ...over,
});
const meta = (role: SnapshotRole, ui: VoiceDebugUi = noUi()): Omit<VoiceDebugMeta, "v"> => ({
  role, diagramType: "bpmn", colorConfig: { task: "#fef3c7" }, displayMode: "normal", ui,
});
/** Save and hand back the saved diagramJson, failing if the ledger skipped it. */
function save(ledger: CaptureLedger, data: DiagramData, m: Omit<VoiceDebugMeta, "v">) {
  const r = captureState(ledger, data, m);
  if (!("diagramJson" in r)) throw new Error(`skipped: ${r.skipped}`);
  return r;
}

const badge = (id: string, n: number): RenameTarget => ({ id, n, kind: "element", x: 10 * n, y: 20, height: 40, label: `Item ${n}` });

describe("T4886 — a snapshot is the whole diagram as JSON, with what was on screen", () => {
  const full = (): DiagramData => ({
    ...PAUL(),
    viewport: { x: -120, y: 40, zoom: 0.8 },
    fontSize: 13,
    laneFontSize: 15,
    relaxedLayout: true,
    title: { text: "Order to Cash" } as DiagramData["title"],
    aiGeneration: { promptId: "p1", promptName: "Secret", promptText: "the customer's confidential prompt", model: "m", generatedAt: "2026-09-01T00:00:00Z" },
    ...({ _archive: { _archivedFromUserEmail: "someone@example.com" } } as object),
  } as DiagramData);

  it("keeps every DiagramData field a replay needs, flat, and never the prompt or the archive", () => {
    const r = save(newCaptureLedger(), full(), meta("marked"));
    const j = r.diagramJson as unknown as Record<string, unknown>;
    // Flat: every reader of the old { elements, connectors } shape still works.
    expect((j.elements as unknown[]).length).toBe(PAUL().elements.length);
    expect((j.connectors as unknown[]).length).toBe(PAUL().connectors.length);
    // The fields the old snapshot dropped change what a replayed command does.
    expect(j.viewport).toEqual({ x: -120, y: 40, zoom: 0.8 });
    expect(j.fontSize).toBe(13);
    expect(j.laneFontSize).toBe(15);
    expect(j.relaxedLayout).toBe(true);
    expect(j.title).toEqual({ text: "Order to Cash" });
    expect(j, "customer prompt text is never saved").not.toHaveProperty("aiGeneration");
    expect(j, "nor user emails and ids").not.toHaveProperty("_archive");
    expect(JSON.stringify(j)).not.toContain("confidential");
    expect(JSON.stringify(j)).not.toContain("someone@example.com");
  });

  it("carries _voiceDebug: its own shape version, why it was saved, and how the canvas drew it", () => {
    const ui = noUi({ selectedIds: [PICK_ITEMS], selectedConnectorId: "c1", pointer: { x: 5, y: 6 }, voiceLastId: "v1" });
    const j = save(newCaptureLedger(), full(), meta("marked", ui)).diagramJson;
    expect(j._voiceDebug).toEqual({
      v: SNAPSHOT_SHAPE_VERSION, role: "marked", diagramType: "bpmn", colorConfig: { task: "#fef3c7" }, displayMode: "normal", ui,
    });
    expect(SNAPSHOT_SHAPE_VERSION).toBe(2);
  });

  it("the numbered badges are the canvas's own array — the rename pick's, else the message pick's, else the picker's", () => {
    const r = [badge("a", 1)], m = [badge("b", 1)], p = [badge("c", 1)];
    expect(badgesOnScreen({ phase: "pick", targets: r }, { targets: m }, { targets: p })).toBe(r);
    expect(badgesOnScreen({ phase: "name" }, { targets: m }, { targets: p }), "a rename waiting for its name shows no numbers").toBe(m);
    expect(badgesOnScreen(null, null, { targets: p })).toBe(p);
    expect(badgesOnScreen(null, null, null)).toBeUndefined();
    const saved = save(newCaptureLedger(), PAUL(), meta("marked", noUi({ badges: r }))).diagramJson;
    expect(saved._voiceDebug.ui.badges, "saved exactly as drawn").toEqual(r);
  });

  it("the open flow is a PROJECTION — a template window never brings its pictures or its second diagram", () => {
    const card = { n: 3, id: "tpl-3", name: "Approval with Re-Work", group: "Approvals", source: "builtin", thumbnailSvg: "<svg><rect/></svg>" };
    const open: OpenFlows = {
      template: {
        anchorId: "t9", anchorName: "Review",
        cards: [card, { ...card, n: 4, id: "tpl-4" }],
        provisional: {
          card, ids: { elements: ["e1", "e2"], connectors: ["k1"] },
          ...({ stamp: 7, base: { elements: PAUL().elements, connectors: PAUL().connectors } } as object),
        } as NonNullable<OpenFlows["template"]>["provisional"],
      },
      pick: null, rename: null, message: null,
    };
    const flow = projectFlow(open);
    expect(flow).toEqual({
      kind: "template", anchorId: "t9", anchorName: "Review", cardCount: 2,
      provisional: { cardId: "tpl-3", name: "Approval with Re-Work", n: 3, elementIds: ["e1", "e2"], connectorIds: ["k1"] },
    });
    const text = JSON.stringify(save(newCaptureLedger(), PAUL(), meta("marked", noUi({ flow }))).diagramJson._voiceDebug);
    expect(text, "no thumbnail SVG").not.toContain("<svg");
    expect(text).not.toContain("thumbnailSvg");
    expect(text, "no copy of the diagram under the preview").not.toContain("\"base\"");
    expect(text.length, "a few hundred bytes, not a second diagram").toBeLessThan(600);
  });

  it("projects the other flows by their ids, in the runner's order", () => {
    const t = [badge("x", 1), badge("y", 2)];
    expect(projectFlow({ template: null, pick: { ref: "Review", prompt: "which Review?", targets: t }, rename: null, message: null }))
      .toEqual({ kind: "pick", ref: "Review", prompt: "which Review?", targetIds: ["x", "y"] });
    expect(projectFlow({ template: null, pick: null, rename: { phase: "pick", itemType: "task", targets: t }, message: null }))
      .toEqual({ kind: "rename", phase: "pick", targetIds: ["x", "y"] });
    expect(projectFlow({ template: null, pick: null, rename: { phase: "name", itemType: "task", targetId: "x" }, message: null }))
      .toEqual({ kind: "rename", phase: "name", targetId: "x" });
    expect(projectFlow({ template: null, pick: null, rename: null, message: { mode: "one", targets: t, anchorId: "a" } }))
      .toEqual({ kind: "message", mode: "one", targetIds: ["x", "y"], anchorId: "a" });
    expect(projectFlow({ template: null, pick: null, rename: null, message: null })).toBeNull();
  });
});

describe("T4887 — automatic capture saves at most one copy per distinct state, and stops before the save cap", () => {
  it("the same state is never saved twice, by reference or by content", () => {
    const d0 = PAUL();
    const start = save(newCaptureLedger(), d0, meta("start"));
    const same = captureState(start.ledger, d0, meta("before"));
    expect("skipped" in same && same.skipped, "the after-state of one command IS the next command's before").toBe("unchanged");
    // A new object holding the same diagram (a reducer that returned a copy).
    const copy = captureState(start.ledger, structuredClone(d0), meta("after"));
    expect("skipped" in copy && copy.skipped, "a copy of the same diagram is the same state").toBe("unchanged");
    // A real change is saved, and the running total grows by what was saved.
    const d1 = { ...d0, elements: d0.elements.map((e) => (e.id === PICK_ITEMS ? { ...e, label: "Pick Stock" } : e)) };
    const after = save(start.ledger, d1, meta("after"));
    expect(after.ledger.bytes).toBe(start.bytes + after.bytes);
    expect(after.bytes, "the size of what the file will carry").toBeGreaterThan(JSON.stringify(d1.elements).length);
  });

  it("the total counts UTF-8 BYTES, what the save route's cap counts — not UTF-16 units", () => {
    // Labels in accented and CJK text: a string's length undercounts them (a
    // CJK character is one unit and three bytes), so a diagram labelled that
    // way could pass the route's 40 MB while the total still read under 30.
    const d0 = PAUL();
    const d1 = { ...d0, elements: d0.elements.map((e, i) => ({ ...e, label: `Überprüfung 検査承認 ${i}` })) };
    const r = save(newCaptureLedger(), d1, meta("after"));
    const onTheWire = Buffer.byteLength(JSON.stringify(r.diagramJson), "utf8");
    expect(JSON.stringify(r.diagramJson).length, "the case this is about: fewer units than bytes").toBeLessThan(onTheWire);
    expect(r.bytes, "never less than the bytes the file will carry").toBeGreaterThanOrEqual(onTheWire);
    expect(r.bytes - onTheWire, "and no more than the key it adds").toBeLessThanOrEqual(2);
  });

  it("📷 always saves — the badges or the selection may be the point, with the diagram unchanged", () => {
    const d0 = PAUL();
    const start = save(newCaptureLedger(), d0, meta("start"));
    const marked = captureState(start.ledger, d0, meta("marked", noUi({ badges: [badge(PICK_ITEMS, 1)] })));
    expect("diagramJson" in marked).toBe(true);
  });

  it("past the limit it stops, says so ONCE, and 📷 still saves", () => {
    const d0 = PAUL();
    const nearly: CaptureLedger = { ...newCaptureLedger(), bytes: AUTO_CAPTURE_LIMIT_BYTES - 100 };
    const hit = captureState(nearly, d0, meta("after"));
    expect("skipped" in hit && hit.skipped).toBe("limit");
    expect("stoppedNow" in hit && hit.stoppedNow, "the editor writes its log line on this one").toBe(true);
    const d1 = { ...d0, connectors: [] };
    const later = captureState(hit.ledger, d1, meta("before"));
    expect("skipped" in later && later.skipped).toBe("stopped");
    expect("stoppedNow" in later && later.stoppedNow, "and never again").toBe(false);
    expect("diagramJson" in captureState(hit.ledger, d1, meta("marked")), "a person asked for this one").toBe(true);
    expect(AUTO_CAPTURE_LIMIT_BYTES, "under the save route's 40 MB cap").toBeLessThan(40 * 1024 * 1024);
    expect(src("app", "api", "admin", "voice-debug", "sessions", "route.ts")).toContain("const MAX_BYTES = 40 * 1024 * 1024;");
    const line = captureStoppedSummary(hit.ledger);
    expect(line).toContain("30 MB");
    expect(line).toContain("📷");
  });
});

describe("T4888 — a saved snapshot reads back, loads headless and replays a command", () => {
  it("an old snapshot (shape 1) reads as BPMN with default colours, and nothing else", () => {
    const r = readSnapshotDiagram(PAUL())!;
    expect(r.meta).toBeNull();
    expect([r.diagramType, r.colorConfig, r.displayMode]).toEqual(["bpmn", {}, "normal"]);
    expect(r.data.elements).toHaveLength(PAUL().elements.length);
    expect(r.data.viewport, "the type needs one; nothing reads it").toEqual({ x: 0, y: 0, zoom: 1 });
    expect(readSnapshotDiagram(null)).toBeNull();
    expect(readSnapshotDiagram({ hello: "world" }), "not a diagram").toBeNull();
  });

  it("a new one hands back the diagram WITHOUT _voiceDebug, and the meta beside it", () => {
    const j = save(newCaptureLedger(), PAUL(), { ...meta("after"), displayMode: "hand-drawn" }).diagramJson;
    const r = readSnapshotDiagram(j)!;
    expect(r.data).not.toHaveProperty("_voiceDebug");
    expect(r.meta?.role).toBe("after");
    expect([r.diagramType, r.colorConfig, r.displayMode]).toEqual(["bpmn", { task: "#fef3c7" }, "hand-drawn"]);
  });

  it("Paul's diagram, saved with its selection, survives the session file and replays “rename selected” headless", () => {
    const shot: DebugSnapshot = {
      id: "s1", entryId: "e1", takenAt: 1_700_000_000_000,
      diagramJson: save(newCaptureLedger(), PAUL(), meta("before", noUi({ selectedIds: [PICK_ITEMS] }))).diagramJson,
      elementCount: PAUL().elements.length, connectorCount: PAUL().connectors.length,
    };
    const file = buildDebugSessionFile({ title: "t", entries: [], snapshots: [shot], savedAt: 1 });
    const back = parseDebugSession(serialiseDebugSession(file))!;
    const r = readSnapshotDiagram(back.snapshots[0].diagramJson)!;

    const h = headlessDiagram(r.data);
    const ops = parseCommand("rename selected to Pick Stock")!;
    const out = applyAssistOps(ops, h.context({ selectedIds: r.meta!.ui.selectedIds }));
    expect(out.ok, out.summary).toBe(true);
    expect(h.data.elements.find((e) => e.id === PICK_ITEMS)!.label).toBe("Pick Stock");
    // Without the saved selection the same words cannot be replayed at all —
    // which is why a snapshot now keeps what was on screen.
    const bare = headlessDiagram(r.data);
    expect(applyAssistOps(ops, bare.context()).ok).toBe(false);
  });

  it("the old shape still replays by name", () => {
    const h = headlessDiagram(readSnapshotDiagram(PAUL())!.data);
    expect(applyAssistOps(parseCommand("rename Pick items to Pick Stock")!, h.context()).ok).toBe(true);
    expect(h.data.elements.find((e) => e.id === PICK_ITEMS)!.label).toBe("Pick Stock");
  });
});

describe("T4889 — Download JSON writes the standard export envelope, so Import JSON opens it", () => {
  const shot = () => ({
    takenAt: Date.UTC(2026, 8, 26, 8, 12, 3),
    diagramJson: save(newCaptureLedger(), PAUL(), { ...meta("after"), colorConfig: { pool: "#e0f2fe" } }).diagramJson,
  });
  const file = () => snapshotDiagramFile(shot(), { diagramId: "d1", diagramName: "Block 2 Test 3", appVersion: "2.12", exportedAt: "2026-09-26T08:20:00.000Z" })!;

  it("passes the editor's Import JSON checks and a project's", () => {
    const parsed = JSON.parse(serialiseEnvelope(file()));
    // The editor (DiagramEditor handleImportFile).
    expect(Array.isArray(parsed.diagrams) && parsed.diagrams.length > 0).toBe(true);
    expect(typeof parsed.diagrams[0].data).toBe("object");
    // A project (ProjectDetailClient handleImportFile).
    expect(parsed.project && parsed.diagrams).toBeTruthy();
    // Both.
    expect(checkSchemaCompatibility(parsed.schemaVersion)).toEqual({ ok: true });
  });

  it("the diagram goes in clean: no _voiceDebug in data, the type and colours where an export puts them", () => {
    const d = file().diagrams[0];
    expect(d.data, "Import would otherwise save it into the diagram").not.toHaveProperty("_voiceDebug");
    expect(d.data.elements).toHaveLength(PAUL().elements.length);
    expect([d.type, d.colorConfig, d.displayMode]).toEqual(["bpmn", { pool: "#e0f2fe" }, "normal"]);
    expect(d.name).toBe("Block 2 Test 3 — voice debug after 2026-09-26 08:12:03");
    expect(snapshotFilename("Block 2 Test 3", "after", shot().takenAt)).toBe("Block-2-Test-3-voice-debug-after-2026-09-26-081203.json");
    // An old snapshot downloads too, as BPMN in the default colours.
    const old = snapshotDiagramFile({ takenAt: 0, diagramJson: PAUL() }, { diagramId: null, diagramName: null, appVersion: "2.12" })!;
    expect([old.diagrams[0].type, old.diagrams[0].colorConfig, old.diagrams[0].displayMode]).toEqual(["bpmn", {}, "normal"]);
    expect(snapshotDiagramFile({ takenAt: 0, diagramJson: null }, { diagramId: null, diagramName: null, appVersion: "2.12" })).toBeNull();
  });

  it("is the SAME envelope the editor's own export writes — one builder, not a copy", () => {
    const env = singleDiagramEnvelope(
      { originalId: "d1", name: "n", type: "bpmn", data: PAUL(), colorConfig: {}, displayMode: "normal" },
      { appVersion: "2.12", exportedAt: "x" },
    );
    expect(Object.keys(env)).toEqual(["schemaVersion", "appVersion", "exportedAt", "project", "diagrams"]);
    expect(env.schemaVersion).toBe(SCHEMA_VERSION);
    expect(env.project).toEqual({ name: "(single diagram)", description: "", ownerName: "", colorConfig: {} });
    expect(JSON.parse(serialiseEnvelope(env)).diagrams[0].data, "round-trips unchanged").toEqual(PAUL());

    const ed = EDITOR();
    const build = ed.slice(ed.indexOf("async function buildDiagramJsonString"), ed.indexOf("async function handleExportJson"));
    expect(build).toContain("serialiseEnvelope(singleDiagramEnvelope(");
    expect(ed, "the SharePoint save builds it the same way").toContain("const payload = singleDiagramEnvelope(");
    expect(ed, "no hand-written envelope is left in the editor").not.toContain('project: { name: "(single diagram)"');
    // The checks the first test mirrors, so the mirror cannot quietly drift.
    expect(ed).toContain("if (!parsed || !Array.isArray(parsed.diagrams) || parsed.diagrams.length === 0) {");
    expect(ed).toContain('if (!first || typeof first.data !== "object") {');
    const project = src("app", "(dashboard)", "dashboard", "projects", "[id]", "ProjectDetailClient.tsx");
    expect(project).toContain("if (!exportData || !exportData.project || !exportData.diagrams) {");
  });
});

describe("T4890 — the session file: pretty commands, one line per snapshot", () => {
  const shots = (n: number): DebugSnapshot[] => Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, entryId: i % 2 ? `e${i}` : null, takenAt: i,
    diagramJson: save(newCaptureLedger(), PAUL(), meta(i % 2 ? "after" : "before")).diagramJson,
    elementCount: 1, connectorCount: 0,
  }));

  it("round-trips, with each snapshot on one line", () => {
    const file = buildDebugSessionFile({
      title: "t", entries: [{ id: "e1", heard: "delete Do nothing", summary: "deleted Do nothing", ok: true, at: 5, ops: [{ op: "delete", ref: "Do nothing" }] }],
      snapshots: shots(3), savedAt: 9,
    });
    const text = serialiseDebugSession(file);
    expect(parseDebugSession(text)).toEqual(file);
    const lines = text.split("\n");
    expect(lines.filter((l) => l.startsWith("    {\"id\":\"s")), "one line each").toHaveLength(3);
    expect(text, "the commands are still readable").toContain('\n      "heard": "delete Do nothing",');
    expect(text.length, "and far smaller than indenting the diagrams").toBeLessThan(JSON.stringify(file, null, 2).length / 1.5);
  });

  it("an empty session and a viewer-shaped one (extra keys) serialise too", () => {
    const empty = buildDebugSessionFile({ title: "t", entries: [], savedAt: 1 });
    expect(parseDebugSession(serialiseDebugSession(empty))).toEqual(empty);
    const fromGet = { ...buildDebugSessionFile({ title: "t", entries: [], snapshots: shots(1), savedAt: 1 }), id: "row1", counts: { entryCount: 0 } };
    const back = JSON.parse(serialiseDebugSession(fromGet));
    expect(back.id).toBe("row1");
    expect(back.snapshots).toHaveLength(1);
  });
});

describe("T4891 — the viewer draws a snapshot on demand, and never an <img> without a picture", () => {
  it("a picture only when the GET says there is one", () => {
    expect(snapshotPicture({ hasPicture: true, url: "/api/admin/voice-debug/snapshots/a" })).toBe("/api/admin/voice-debug/snapshots/a");
    expect(snapshotPicture({ hasPicture: false, url: "/api/admin/voice-debug/snapshots/a" })).toBeNull();
    expect(snapshotPicture({ url: "/api/admin/voice-debug/snapshots/a" }), "an older GET without the flag").toBeNull();
    expect(snapshotPicture({ hasPicture: true, url: "" })).toBeNull();
    const route = src("app", "api", "admin", "voice-debug", "sessions", "[id]", "route.ts");
    expect(route).toContain("hasPicture: s.pngWidth != null,");
  });

  it("the viewer's only <img> is the picture snapshotPicture allows", () => {
    const v = VIEWER();
    // `<img ` with a space: the element, not the word in a comment.
    expect(v.match(/<img\s/g), "one <img> element in the whole viewer").toHaveLength(1);
    expect(v).toContain("const picture = snapshotPicture(s);");
    expect(v).toMatch(/\{picture && \([\s\S]{0,120}<img src=\{picture\}/);
  });

  it("the editor's canvas, read-only, lazily loaded, one snapshot at a time, badges redrawn", () => {
    const v = VIEWER();
    expect(v).toContain('const SnapshotCanvas = dynamic(() => import("./SnapshotCanvas"), {');
    expect(v).toContain("ssr: false,");
    expect(v, "no static import of the canvas into the page").not.toMatch(/import \{ Canvas \}/);
    expect(v).toContain("const [drawnId, setDrawnId] = useState<string | null>(null);");
    expect(v).toContain("drawn={drawnId === s.id}");
    // Only the drawn one mounts a canvas — each is a whole editor canvas.
    expect(v).toContain("{drawn && reading && <SnapshotCanvas reading={reading} />}");
    expect(v.match(/<SnapshotCanvas\s/g), "and nowhere else").toHaveLength(1);
    const d = DRAWER();
    expect(d).toContain('import { Canvas } from "@/app/components/canvas/Canvas";');
    // The PROP, on a line of its own — not the word in the docblock.
    expect(d).toMatch(/^\s+readOnly\r?$/m);
    expect(d).toContain("renameBadges={ui?.badges ?? undefined}");
    expect(d).toContain("onAddElement={noop}");
  });

  it("Download JSON, Copy JSON, and the session download with the bar's own name and serialiser", () => {
    const v = VIEWER();
    expect(v).toContain("snapshotDiagramFile(s, {");
    expect(v).toContain("saveText(serialiseEnvelope(file), snapshotFilename(");
    expect(v).toContain("navigator.clipboard.writeText(JSON.stringify(s.diagramJson, null, 2))");
    expect(v).toContain("saveText(serialiseDebugSession(d as unknown as DebugSessionFile), debugSessionFilename(d.diagram.name, new Date(d.savedAt).toISOString()));");
    expect(v, "house rule: no browser dialogs").not.toMatch(/\b(alert|confirm|prompt)\(/);
  });
});

describe("T4892 — every log line is stamped, and a command's line carries its ops", () => {
  it("ONE append site, which stamps `at` and takes the ops just applied", () => {
    const ed = EDITOR();
    expect(ed.match(/setVoiceLog\(\(prev\) => \[\.\.\.prev/g), "every line goes through appendLog").toHaveLength(1);
    const helper = ed.slice(ed.indexOf("const appendLog = useCallback("), ed.indexOf("const [voiceListening"));
    expect(helper).toContain("{ id: nanoid(), at: Date.now(), ...entry, ...(ops ? { ops } : {}) }");
    expect(helper).toContain("appliedOpsRef.current = null;");
    expect(ed, "the runner's log is the helper").toContain("const log = appendLog;");
    expect(ed, "the message flow's too").toContain("const log = (summary: string, ok: boolean) => appendLog({ heard: t, summary, ok });");
  });

  it("the ops are set where every command applies, AFTER the debug arm", () => {
    const ed = EDITOR();
    const body = ed.slice(ed.indexOf("const applyAssistOps = useCallback("), ed.indexOf("return applyAssistOpsTo(ops, {"));
    const arm = body.indexOf("armDebugBefore(data.elements);");
    const set = body.indexOf("appliedOpsRef.current = ops;");
    expect(arm).toBeGreaterThan(-1);
    expect(set, "after the arm, whose size-limit line must not take them").toBeGreaterThan(arm);
    expect(body).toContain("queueMicrotask(() => { if (appliedOpsRef.current === ops) appliedOpsRef.current = null; });");
  });
});

describe("T4893 — the editor saves the diagram around every command, and takes no picture", () => {
  it("before, after, start and 📷 all go through the one ledger", () => {
    const ed = EDITOR();
    const arm = ed.slice(ed.indexOf("const armDebugBefore = useCallback("), ed.indexOf("}, [voiceDebugRecording]);"));
    expect(arm).toContain('saveDebugStateRef.current(before, "before", null)');
    // Two applies before a render share the first one's before-state.
    expect(arm).toContain("if (!debugArmRef.current) {");
    expect(ed).toContain('const { linkBefore, entrySnapshot } = settleArm(armed, data, lastEntryId, (entryId) => saveDebugStateRef.current(data, "after", entryId));');
    expect(ed, "keyed on the log too, so a command that changed nothing clears its arm").toContain("}, [data, voiceLog]);");
    expect(ed).toContain('if (voiceAssistOn && voiceDebugRecording) saveDebugStateRef.current(debugDataRef.current, "start", null);');
    expect(ed, "on opening the bar with debug on, and on a new epoch (T4896)").toContain("}, [voiceAssistOn, voiceDebugRecording, debugEpoch]);");
    const shot = ed.slice(ed.indexOf("const takeDebugSnapshot"), ed.indexOf("const downloadDebugSession"));
    expect(shot).toContain('saveDebugStateRef.current(data, "marked", entryId)');
    expect(ed).toContain("const r = captureState(debugLedgerRef.current, state, {");
    expect(ed).toContain("if (r.stoppedNow) appendLog({ heard: \"\", summary: captureStoppedSummary(r.ledger), ok: true });");
  });

  it("every command that changes the diagram arms it: the op batch, a template pick, a rename, an undo in the rename pick, a template taken off", () => {
    const ed = EDITOR();
    expect(ed.match(/armDebugBefore\(/g)!.length, "five callers").toBe(5);
    const rename = ed.slice(ed.indexOf("const applyRenameName = useCallback("), ed.indexOf("// Handle one utterance while the guided rename flow is active."));
    expect(rename).toContain("armDebugBefore(data.elements);");
    // "undo" said in the rename pick changes the diagram without the op batch;
    // unarmed, its result was saved only as the next command's "before".
    const pickUndo = ed.slice(ed.indexOf("if (/^undo\\b/.test(low)) {"), ed.indexOf('appendLog({ heard: t, summary: "undid the last change", ok: true });'));
    expect(pickUndo.indexOf("armDebugBefore(elementsRef.current);"), "armed").toBeGreaterThan(-1);
    expect(pickUndo.indexOf("armDebugBefore(elementsRef.current);"), "before the undo").toBeLessThan(pickUndo.indexOf("undo();"));
    const close = ed.slice(ed.indexOf("const closeTemplateFlow = useCallback("), ed.indexOf("/** The window's numbered offer"));
    expect(close).toContain("armDebugBefore(elementsRef.current);");
  });

  it("the canvas and the recording read the badges from one value", () => {
    const ed = EDITOR();
    expect(ed).toContain("const onScreenBadges = badgesOnScreen(renameFlow, messageFlow, pickFlow);");
    expect(ed).toContain("renameBadges={onScreenBadges}");
    expect(ed).toContain("badges: onScreenBadges ?? null,");
    expect(ed).toContain("flow: projectFlow({ template: templateFlow, pick: pickFlow, rename: renameFlow, message: messageFlow }),");
  });

  it("what was on screen is read from the editor's live refs, not left empty", () => {
    // "rename selected", "it" and "here" cannot be replayed without them (T4888).
    const ed = EDITOR();
    const ui = ed.slice(ed.indexOf("saveDebugStateRef.current = (state, role, entryId) => {"), ed.indexOf("debugLedgerRef.current = r.ledger;"));
    for (const line of [
      "role, diagramType, colorConfig: diagramColorConfig, displayMode,",
      "selectedIds: [...selectedIdsRef.current],",
      "selectedConnectorId: selectedConnectorIdRef.current,",
      "pointer: pointerWorld.current ? { ...pointerWorld.current } : null,",
      "voiceLastId: voiceLastId.current,",
    ]) expect(ui, line).toContain(line);
  });

  it("no picture anywhere: the whole-canvas capture is gone, the SOP figure's helpers stay", () => {
    const snap = src("app", "lib", "diagram", "canvasSnapshot.ts");
    expect(snap).not.toContain("export async function captureCanvasPng");
    expect(snap).not.toContain("export function prepareCanvasClone");
    for (const kept of ["export function contentBounds", "export function fitOutputSize", "export function stripSelectionChrome", "export async function svgToPng"]) {
      expect(snap, kept).toContain(kept);
    }
    expect(EDITOR()).not.toContain("captureCanvasPng");
    expect(EDITOR()).not.toContain("png:");
  });

  it("the bar says what it does now", () => {
    const bar = src("app", "components", "canvas", "VoiceAssistBar.tsx");
    expect(bar).not.toContain("Take a picture");
    expect(bar).toContain('title="Save the diagram as it is now (JSON) — marks this moment, with the numbered badges and the selection on screen">📷 Snapshot</button>');
    expect(bar).toContain('"Save the diagram as it is now (JSON), for this command"');
  });
});

/** A label change on one element: a new diagram, as a command or a drag makes. */
const relabel = (d: DiagramData, id: string, label: string): DiagramData =>
  ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, label } : e)) });

/**
 * The editor's capture without React: the ledger, what it saved, and the two
 * halves the editor runs — `armDebugBefore` when a command applies, the
 * after-effect (`settleArm`) once it has rendered.
 */
function recorder() {
  let ledger = newCaptureLedger();
  const saved: { id: string; role: SnapshotRole; entryId: string | null; data: DiagramData }[] = [];
  const keep = (data: DiagramData, role: SnapshotRole, entryId: string | null) => {
    const r = captureState(ledger, data, meta(role));
    ledger = r.ledger;
    if (!("diagramJson" in r)) return null;
    const id = `s${saved.length + 1}`;
    saved.push({ id, role, entryId, data });
    return id;
  };
  const arm = (before: DiagramData): ArmedCapture => ({ before, beforeShotId: keep(before, "before", null) });
  const settle = (armed: ArmedCapture, data: DiagramData, entryId: string | null) =>
    settleArm(armed, data, entryId, (id) => keep(data, "after", id));
  return { saved, keep, arm, settle };
}

describe("T4895 — a command's saved states are settled after its render, by one rule", () => {
  it("a command that changed the diagram: its after is saved on its line, and needs no before of its own", () => {
    const rec = recorder();
    const d0 = PAUL();
    rec.keep(d0, "start", null);
    const armed = rec.arm(d0);
    expect(armed.beforeShotId, "the start already is the diagram it ran against").toBeNull();
    const s = rec.settle(armed, relabel(d0, PICK_ITEMS, "Pick Stock"), "e1");
    expect(s).toEqual({ linkBefore: null, entrySnapshot: { entryId: "e1", snapshotId: "s2" } });
    expect(rec.saved.map((x) => [x.role, x.entryId])).toEqual([["start", null], ["after", "e1"]]);
  });

  it("the mouse changed it first: the before is saved, and joins the command's line", () => {
    const rec = recorder();
    const d0 = PAUL();
    rec.keep(d0, "start", null);
    const dragged = { ...d0, elements: d0.elements.map((e) => (e.id === PICK_ITEMS ? { ...e, x: e.x + 40 } : e)) };
    const armed = rec.arm(dragged);
    expect(armed.beforeShotId).toBe("s2");
    const s = rec.settle(armed, relabel(dragged, PICK_ITEMS, "Pick Stock"), "e1");
    expect(s).toEqual({ linkBefore: { snapshotId: "s2", entryId: "e1" }, entrySnapshot: { entryId: "e1", snapshotId: "s3" } });
  });

  it("a command that changed nothing saves no after, and its line keeps the before the mouse earned — or nothing", () => {
    const d0 = PAUL();
    const calls: (string | null)[] = [];
    const spy = (id: string | null) => { calls.push(id); return "never"; };
    expect(settleArm({ before: d0, beforeShotId: "b1" }, d0, "e1", spy))
      .toEqual({ linkBefore: { snapshotId: "b1", entryId: "e1" }, entrySnapshot: { entryId: "e1", snapshotId: "b1" } });
    expect(settleArm({ before: d0, beforeShotId: null }, d0, "e1", spy)).toEqual({ linkBefore: null, entrySnapshot: null });
    expect(calls, "the same diagram is never saved as an after").toEqual([]);
  });

  it("with no line to tie it to, the after is still saved — it is the next command's before", () => {
    const d0 = PAUL();
    const calls: (string | null)[] = [];
    const s = settleArm({ before: d0, beforeShotId: "b1" }, relabel(d0, PICK_ITEMS, "X"), null, (id) => { calls.push(id); return "a1"; });
    expect(calls).toEqual([null]);
    expect(s).toEqual({ linkBefore: null, entrySnapshot: null });
  });

  it("an after the ledger skips (the same diagram in a new object) leaves the line its before", () => {
    const d0 = PAUL();
    const s = settleArm({ before: d0, beforeShotId: "b1" }, structuredClone(d0), "e1", () => null);
    expect(s.entrySnapshot).toEqual({ entryId: "e1", snapshotId: "b1" });
  });

  it("the editor clears the arm FIRST, then settles through settleArm and applies both links", () => {
    const ed = EDITOR();
    const effect = ed.slice(ed.indexOf("const armed = debugArmRef.current;"), ed.indexOf("}, [data, voiceLog]);"));
    const clear = effect.indexOf("debugArmRef.current = null;");
    // Left set, every later mouse drag would be saved as this command's "after".
    expect(clear, "the arm is cleared").toBeGreaterThan(-1);
    expect(clear, "before the settling").toBeLessThan(effect.indexOf("settleArm("));
    expect(effect).toContain("const lastEntryId = voiceLog.length ? voiceLog[voiceLog.length - 1].id : null;");
    expect(effect).toContain("if (linkBefore) setDebugSnapshots((prev) => prev.map((s) => (s.id === linkBefore.snapshotId ? { ...s, entryId: linkBefore.entryId } : s)));");
    expect(effect).toContain("if (entrySnapshot) setVoiceLog((prev) => prev.map((e) => (e.id === entrySnapshot.entryId ? { ...e, snapshotId: entrySnapshot.snapshotId } : e)));");
    expect(ed).toContain("const debugArmRef = useRef<ArmedCapture | null>(null);");
  });
});

describe("T4896 — the bar's clear starts the recording afresh", () => {
  it("kept, the ledger would still hold the last after — the next state would not be saved", () => {
    const d0 = PAUL();
    const kept = save(newCaptureLedger(), d0, meta("after")).ledger;
    expect("skipped" in captureState(kept, d0, meta("start")), "the old ledger: nothing").toBe(true);
    expect("diagramJson" in captureState(newCaptureLedger(), d0, meta("start")), "a fresh one: the new start").toBe(true);
  });

  it("clear empties the log, the saved states, the ledger and the arm, and wakes the start effect", () => {
    const ed = EDITOR();
    expect(ed).toContain("onClear={clearVoiceLog}");
    const body = ed.slice(ed.indexOf("const clearVoiceLog = useCallback(() => {"), ed.indexOf("/** Record what Paul thought of one command. */"));
    for (const line of [
      "setVoiceLog([]);",
      "setDebugSnapshots([]);",
      "debugLedgerRef.current = newCaptureLedger();",
      "debugArmRef.current = null;",
      "debugBeforeRef.current = null;",
      "setDebugEpoch((n) => n + 1);",
    ]) expect(body, line).toContain(line);
    // The "start" rule stays in one place: the effect, woken by the new epoch.
    expect(body).not.toContain('"start"');
    expect(ed).toContain("}, [voiceAssistOn, voiceDebugRecording, debugEpoch]);");
  });
});

describe("T4897 — a command queued behind an AI call gets its own before and after", () => {
  it("run in the same tick, the two fold into one after on the second line, and the first line has none", () => {
    const d0 = PAUL();
    const d1 = relabel(d0, PICK_ITEMS, "Check Stock");
    const d2 = relabel(d1, PICK_ITEMS, "Pick Stock");
    // What the synchronous drain did: one arm, both applied, one render.
    const folded = recorder();
    folded.keep(d0, "start", null);
    folded.settle(folded.arm(d0), d2, "e2");
    expect(folded.saved.some((x) => x.data === d1), "the AI command's result was never saved").toBe(false);
    // Drained after the render: each command is settled before the next arms.
    const rec = recorder();
    rec.keep(d0, "start", null);
    const a = rec.settle(rec.arm(d0), d1, "e1");
    const b = rec.settle(rec.arm(d1), d2, "e2");
    expect(a.entrySnapshot).toEqual({ entryId: "e1", snapshotId: "s2" });
    expect(b.entrySnapshot).toEqual({ entryId: "e2", snapshotId: "s3" });
    expect(rec.saved.map((x) => x.role), "one command's after is the next one's before").toEqual(["start", "after", "after"]);
  });

  it("the editor drains after the render, in an effect declared after the one that settles the command before", () => {
    const ed = EDITOR();
    const settle = ed.indexOf("const { linkBefore, entrySnapshot } = settleArm(");
    const drain = ed.indexOf("if (next !== undefined) void runAbraCommandRef.current(next, true);");
    expect(settle).toBeGreaterThan(-1);
    // React runs one component's effects in the order they are declared.
    expect(drain, "the drain effect comes after the settle effect").toBeGreaterThan(settle);
    const fin = ed.slice(ed.indexOf("voiceBusyRef.current = false;"));
    expect(fin.slice(0, fin.indexOf("}, [applyGrouped, appendLog, data.elements, data.connectors]);")), "the finally only wakes it")
      .not.toContain("runAbraCommandRef");
  });
});
