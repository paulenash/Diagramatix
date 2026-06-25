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
import { exportVisioV3 } from "@/app/lib/diagram/v3/exportVisioV3";
import { DEFAULT_PROFILE, type StencilProfile } from "@/app/lib/diagram/v3/stencilProfile";

export interface VsdxShape {
  id: string;
  master: string | null;   // referenced master id (null for inline sub-shapes)
  bpmnId: string | null;   // the diagram element/connector id this shape came from
  nameU: string | null;
}
export interface ParsedVsdx {
  shapes: VsdxShape[];
  masterIds: Set<string>;
  pageXml: string;
}

export async function exportToVsdx(
  data: DiagramData,
  profile: StencilProfile = DEFAULT_PROFILE,
): Promise<ParsedVsdx> {
  const pub = path.join(process.cwd(), "public");
  const stencil = fs.readFileSync(path.join(pub, profile.stencilFile));
  const template = fs.readFileSync(path.join(pub, profile.templateFile));
  const bytes = await exportVisioV3(data, "Test", stencil.buffer, template.buffer, "normal", undefined, profile);
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
    shapes.push({
      id,
      master: head.match(/\bMaster='([^']+)'/)?.[1] ?? null,
      nameU: head.match(/\bNameU='([^']*)'/)?.[1] ?? null,
      bpmnId: b.match(/<Row N='BpmnId'><Cell N='Value' V='([^']*)'/)?.[1] ?? null,
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
