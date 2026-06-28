/**
 * Visio export test harness (layer 1).
 *
 * Runs the real exportVisioV3 (feeding it the profile's stencil + template from
 * /public), unzips the VSDX, and parses the page shapes into a queryable form.
 * findVsdxViolations() asserts structural invariants — the regression net that
 * was missing when a Pool/Lane change once "replicated pools onto tasks" and had
 * to be rolled back.
 *
 * NOTE: this validates the VSDX *structure*, not Visio's visual *render* — a
 * structurally-valid file can still render wrong (the cached-V trap). It hugely
 * reduces "looks right but breaks elsewhere" risk; it doesn't replace one final
 * open-in-Visio check.
 */
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { AiElement } from "@/app/lib/diagram/bpmnLayout";
import { exportVisioV3 } from "@/app/lib/diagram/v3/exportVisioV3";
import { importVisioV3 } from "@/app/lib/diagram/v3/importVisioV3";
import { DEFAULT_PROFILE, type StencilProfile } from "@/app/lib/diagram/v3/stencilProfile";

export interface VsdxShape {
  id: string;
  master: string | null;   // referenced master id (null for inline sub-shapes)
  bpmnId: string | null;   // the diagram element/connector id this shape came from
  nameU: string | null;
  // Position + size cells (strings as emitted; null if the shape omits them).
  pinX: string | null;
  pinY: string | null;
  width: string | null;
  height: string | null;
}
export interface ParsedVsdx {
  shapes: VsdxShape[];
  masterIds: Set<string>;
  pageXml: string;
}

/** Run the real export and return the raw .vsdx bytes (feeds both the structural
 *  parse and the import round-trip). */
export async function buildVsdxBytes(
  data: DiagramData,
  profile: StencilProfile = DEFAULT_PROFILE,
): Promise<Uint8Array> {
  const pub = path.join(process.cwd(), "public");
  const stencil = fs.readFileSync(path.join(pub, profile.stencilFile));
  const template = fs.readFileSync(path.join(pub, profile.templateFile));
  const out = await exportVisioV3(data, "Test", stencil.buffer, template.buffer, "normal", undefined, profile);
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

/** export → importVisioV3 round-trip (layer 5). Returns the import result so a
 *  test can assert the diagram survives the .vsdx and back. */
export async function roundTrip(
  data: DiagramData,
  profile: StencilProfile = DEFAULT_PROFILE,
) {
  const bytes = await buildVsdxBytes(data, profile);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return importVisioV3(ab);
}

export async function exportToVsdx(
  data: DiagramData,
  profile: StencilProfile = DEFAULT_PROFILE,
): Promise<ParsedVsdx> {
  const bytes = await buildVsdxBytes(data, profile);
  const zip = await JSZip.loadAsync(bytes);

  // Valid master IDs come from masters.xml (<Master ID='111' …>), NOT the file
  // names — file master11.xml can carry document master ID 111 via the rels.
  const mastersXml = (await zip.file("visio/masters/masters.xml")?.async("string")) ?? "";
  const masterIds = new Set<string>();
  for (const m of mastersXml.matchAll(/<Master\b[^>]*\bID='(\d+)'/g)) masterIds.add(m[1]);

  const pageXml = (await zip.file("visio/pages/page1.xml")?.async("string")) ?? "";
  const shapes: VsdxShape[] = [];
  // Each shape block runs from one "<Shape " up to the next (covers nested
  // sub-shapes too — they get their own entry, which is fine: we only require a
  // valid master when one is referenced, and only map element→shape via BpmnId).
  const blocks = pageXml.split(/<Shape\s/).slice(1);
  for (const b of blocks) {
    const head = b.slice(0, 500);
    const id = head.match(/\bID='([^']+)'/)?.[1] ?? null;
    if (!id) continue;
    // First occurrence in the block = this shape's own cell (a parent's geometry
    // cells precede its nested <Shapes>; sub-shapes are separate blocks).
    const cellV = (name: string) => b.match(new RegExp(`<Cell N='${name}'[^>]*\\bV='([^']*)'`))?.[1] ?? null;
    shapes.push({
      id,
      master: head.match(/\bMaster='([^']+)'/)?.[1] ?? null,
      nameU: head.match(/\bNameU='([^']*)'/)?.[1] ?? null,
      bpmnId: b.match(/<Row N='BpmnId'><Cell N='Value' V='([^']*)'/)?.[1] ?? null,
      pinX: cellV("PinX"),
      pinY: cellV("PinY"),
      width: cellV("Width"),
      height: cellV("Height"),
    });
  }
  return { shapes, masterIds, pageXml };
}

/** Structural invariants over a parsed VSDX. Empty array = clean. */
export function findVsdxViolations(parsed: ParsedVsdx, data: DiagramData): string[] {
  const v: string[] = [];
  if (parsed.shapes.length === 0) { v.push("page has no shapes"); return v; }

  // 1 ── no shape references a master that wasn't emitted ───────────────────
  for (const s of parsed.shapes) {
    if (s.master && !parsed.masterIds.has(s.master)) {
      v.push(`shape ${s.id} references missing master ${s.master}`);
    }
  }

  // 2 ── no duplicate shape IDs ─────────────────────────────────────────────
  const idCount = new Map<string, number>();
  for (const s of parsed.shapes) idCount.set(s.id, (idCount.get(s.id) ?? 0) + 1);
  for (const [id, n] of idCount) if (n > 1) v.push(`duplicate shape ID ${id} (×${n})`);

  // 3 ── every element maps to EXACTLY ONE shape ────────────────────────────
  //      0 → an element silently dropped; >1 → replication (the Pool/Lane bug).
  const bpmnCount = new Map<string, number>();
  for (const s of parsed.shapes) if (s.bpmnId) bpmnCount.set(s.bpmnId, (bpmnCount.get(s.bpmnId) ?? 0) + 1);
  for (const el of data.elements) {
    const n = bpmnCount.get(el.id) ?? 0;
    if (n === 0) v.push(`element ${el.id} (${el.type}) has no Visio shape`);
    else if (n > 1) v.push(`element ${el.id} (${el.type}) maps to ${n} shapes — replication?`);
  }

  return v;
}

// ── Layer 4 — Pool/Lane invariant registry ──────────────────────────────────

/**
 * Pool/Lane structural invariants — the registry that pins the rules a Pool/Lane
 * change must not break (the Phase-3 rollback "replicated pools onto tasks").
 * Reads the EXPECTED structure from the source AiElements and checks the VSDX:
 *   • each pool → exactly 1 container shape, with a master + cached PinX/PinY,
 *   • a white-box pool's N lanes → exactly N shapes, each with a master + position,
 *   • a black-box pool → NO lanes and NO contained elements (a solid box).
 */
export function findPoolLaneViolations(parsed: ParsedVsdx, elements: AiElement[]): string[] {
  const v: string[] = [];
  const byBpmn = new Map<string, VsdxShape[]>();
  for (const s of parsed.shapes) if (s.bpmnId) {
    const arr = byBpmn.get(s.bpmnId) ?? [];
    arr.push(s);
    byBpmn.set(s.bpmnId, arr);
  }
  const hasPos = (s: VsdxShape) => s.pinX != null && s.pinY != null;

  for (const pool of elements.filter((e) => e.type === "pool")) {
    const ps = byBpmn.get(pool.id) ?? [];
    if (ps.length !== 1) { v.push(`pool ${pool.id} → ${ps.length} shape(s), expected exactly 1 container`); continue; }
    if (!ps[0].master) v.push(`pool ${pool.id} container has no master`);
    if (!hasPos(ps[0])) v.push(`pool ${pool.id} container missing cached PinX/PinY (cached-V trap)`);

    const lanes = pool.lanes ?? [];
    if (pool.poolType === "black-box") {
      if (lanes.length > 0) v.push(`black-box pool ${pool.id} declares ${lanes.length} lane(s) — a black box has none`);
      const inside = elements.filter((e) => e.id !== pool.id && e.pool === pool.id);
      if (inside.length > 0) v.push(`black-box pool ${pool.id} contains ${inside.map((e) => e.id).join(", ")} — should be empty`);
    } else {
      for (const lane of lanes) {
        const ls = byBpmn.get(lane.id) ?? [];
        if (ls.length !== 1) { v.push(`lane ${lane.id} (pool ${pool.id}) → ${ls.length} shape(s), expected exactly 1`); continue; }
        if (!ls[0].master) v.push(`lane ${lane.id} has no master`);
        if (!hasPos(ls[0])) v.push(`lane ${lane.id} missing cached PinX/PinY (cached-V trap)`);
      }
    }
  }
  return v;
}

/**
 * Geometry-row integrity: within every Geometry section, an X cell must be paired
 * with a Y cell — a half-specified path point renders in the wrong place (a
 * symptom of the cached-V / rescale trap).
 */
export function findGeometryViolations(parsed: ParsedVsdx): string[] {
  const v: string[] = [];
  for (const sec of parsed.pageXml.matchAll(/<Section N='Geometry'[^>]*>([\s\S]*?)<\/Section>/g)) {
    let i = 0;
    for (const row of sec[1].matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/g)) {
      i++;
      const hasX = /<Cell N='X'/.test(row[1]);
      const hasY = /<Cell N='Y'/.test(row[1]);
      if (hasX !== hasY) v.push(`a geometry row (#${i}) has ${hasX ? "X but no Y" : "Y but no X"} cell`);
    }
  }
  return v;
}
