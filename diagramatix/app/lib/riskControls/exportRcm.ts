/**
 * Build a Risk-Control Matrix (.xlsx) for a project: the catalog Risks + Controls,
 * how Controls mitigate Risks (links), and WHERE each is attached on the process
 * models (element.properties.risk across the project's diagrams). Coverage gaps
 * (a Risk with no mitigating Control) are surfaced. Uses the hand-built xlsx
 * writer (app/lib/riskControls/xlsx.ts).
 */
import { prisma } from "@/app/lib/db";
import { loadProjectLibrary } from "./queries";
import { buildXlsx, type Sheet } from "./xlsx";
import { riskScore } from "./types";
import { getRiskControl } from "@/app/lib/diagram/riskControl";
import type { DiagramData } from "@/app/lib/diagram/types";
import { CONTROL_TYPE_LABELS } from "./types";

/** Where a catalog item is attached on the models: "Diagram — Step". */
type Attachment = string;

export async function buildRcmXlsx(projectId: string): Promise<{ filename: string; buffer: Buffer } | null> {
  const library = await loadProjectLibrary(projectId);
  if (!library) return null;

  const risks = library.items.filter((i) => i.kind === "Risk");
  const controls = library.items.filter((i) => i.kind === "Control");
  const byId = new Map(library.items.map((i) => [i.id, i]));

  // Control → the Risks it mitigates, and Risk → its Controls.
  const controlsForRisk = new Map<string, string[]>();
  const risksForControl = new Map<string, string[]>();
  for (const ln of library.links) {
    (controlsForRisk.get(ln.riskId) ?? controlsForRisk.set(ln.riskId, []).get(ln.riskId)!).push(ln.controlId);
    (risksForControl.get(ln.controlId) ?? risksForControl.set(ln.controlId, []).get(ln.controlId)!).push(ln.riskId);
  }

  // Scan the project's diagrams for on-model attachments (element.properties.risk).
  const diagrams = await prisma.diagram.findMany({ where: { projectId }, select: { name: true, data: true } });
  const attachOf = new Map<string, Attachment[]>();  // catalog itemId → attachments
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as DiagramData;
    for (const el of data.elements ?? []) {
      const rc = getRiskControl(el);
      for (const ref of [...(rc.riskRefs ?? []), ...(rc.controlRefs ?? [])]) {
        const where = `${d.name} — ${el.label || el.type}`;
        (attachOf.get(ref.itemId) ?? attachOf.set(ref.itemId, []).get(ref.itemId)!).push(where);
      }
    }
  }
  const attachments = (id: string) => (attachOf.get(id) ?? []).join("; ");
  const codeName = (id: string) => { const it = byId.get(id); return it ? `${it.code} ${it.name}` : id; };

  // ── Sheet 1: Risk-Control Matrix (one row per Risk) ──
  const rcmHeader = ["Risk", "Risk description", "Likelihood", "Impact", "Score", "Category", "Mitigating controls", "Coverage", "Attached on"];
  const rcmRows = risks.map((r) => {
    const ctrls = (controlsForRisk.get(r.id) ?? []).map(codeName);
    return [
      `${r.code} ${r.name}`, r.description ?? "",
      r.likelihood ?? "", r.impact ?? "", riskScore(r) ?? "", r.riskCategory ?? "",
      ctrls.join("; "), ctrls.length ? "Covered" : "GAP — no control",
      attachments(r.id),
    ];
  });

  // ── Sheet 2: Control register ──
  const ctlHeader = ["Control", "Description", "Type", "Frequency", "Owner", "Framework ref", "Mitigates risks", "Attached on"];
  const ctlRows = controls.map((c) => [
    `${c.code} ${c.name}`, c.description ?? "",
    c.controlType ? CONTROL_TYPE_LABELS[c.controlType] : "", c.frequency ?? "", c.owner ?? "", c.frameworkRef ?? "",
    (risksForControl.get(c.id) ?? []).map(codeName).join("; "),
    attachments(c.id),
  ]);

  // ── Sheet 3: Coverage summary ──
  const uncovered = risks.filter((r) => !(controlsForRisk.get(r.id)?.length));
  const summaryRows: (string | number)[][] = [
    ["Risk-Control Matrix — coverage summary"],
    [],
    ["Library", library.name],
    ["Risks", risks.length],
    ["Controls", controls.length],
    ["Mitigation links", library.links.length],
    ["Risks with no control (coverage gaps)", uncovered.length],
    [],
    ["Coverage gaps:"],
    ...(uncovered.length ? uncovered.map((r) => [`${r.code} ${r.name}`]) : [["None — every risk has at least one control"]]),
  ];

  const sheets: Sheet[] = [
    { name: "Risk-Control Matrix", rows: [rcmHeader, ...rcmRows] },
    { name: "Control Register", rows: [ctlHeader, ...ctlRows] },
    { name: "Coverage Summary", rows: summaryRows },
  ];
  const buffer = await buildXlsx(sheets);
  const filename = `Risk-Control Matrix — ${library.name}.xlsx`;
  return { filename, buffer };
}
