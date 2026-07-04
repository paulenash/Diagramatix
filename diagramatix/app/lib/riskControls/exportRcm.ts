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
import { riskScore, residualScore, CONTROL_TYPE_LABELS, CONTROL_AUTOMATION_LABELS, KIND_LABEL, relationVerb } from "./types";
import { getRiskControl } from "@/app/lib/diagram/riskControl";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Where a catalog item is attached on the models: "Diagram — Step". */
type Attachment = string;

export async function buildRcmXlsx(projectId: string): Promise<{ filename: string; buffer: Buffer } | null> {
  const library = await loadProjectLibrary(projectId);
  if (!library) return null;

  const risks = library.items.filter((i) => i.kind === "Risk");
  const controls = library.items.filter((i) => i.kind === "Control");
  const byId = new Map(library.items.map((i) => [i.id, i]));
  const kindOf = (id: string) => byId.get(id)?.kind;
  const push = (m: Map<string, string[]>, k: string, v: string) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);

  // Generalised traceability edges (source → target); mitigation is Control→Risk.
  const controlsForRisk = new Map<string, string[]>();      // risk → mitigating controls
  const risksForControl = new Map<string, string[]>();      // control → risks it mitigates
  const linkedTo = new Map<string, string[]>();             // any item → items linked FROM it (source→target)
  const linkedFrom = new Map<string, string[]>();           // any item → items linked TO it (target←source)
  for (const ln of library.links) {
    push(linkedTo, ln.sourceId, ln.targetId);
    push(linkedFrom, ln.targetId, ln.sourceId);
    if (kindOf(ln.sourceId) === "Control" && kindOf(ln.targetId) === "Risk") {
      push(controlsForRisk, ln.targetId, ln.sourceId);
      push(risksForControl, ln.sourceId, ln.targetId);
    }
  }

  // Scan the project's diagrams for on-model attachments (element.properties.risk).
  const diagrams = await prisma.diagram.findMany({ where: { projectId }, select: { name: true, data: true } });
  const attachOf = new Map<string, Attachment[]>();  // catalog itemId → attachments
  const activityRisks: { process: string; activity: string; riskId: string }[] = [];  // for the flat audit grid
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as DiagramData;
    for (const el of data.elements ?? []) {
      const rc = getRiskControl(el);
      const activity = el.label || el.type;
      for (const ref of [...(rc.riskRefs ?? []), ...(rc.controlRefs ?? [])]) {
        (attachOf.get(ref.itemId) ?? attachOf.set(ref.itemId, []).get(ref.itemId)!).push(`${d.name} — ${activity}`);
      }
      for (const ref of rc.riskRefs ?? []) activityRisks.push({ process: d.name, activity, riskId: ref.itemId });
    }
  }
  const attachments = (id: string) => (attachOf.get(id) ?? []).join("; ");
  const codeName = (id: string) => { const it = byId.get(id); return it ? `${it.code} ${it.name}` : id; };
  const autoLabel = (a: string | null) => (a ? CONTROL_AUTOMATION_LABELS[a as keyof typeof CONTROL_AUTOMATION_LABELS] ?? a : "");
  const ofKind = (ids: string[] | undefined, kind: string) => (ids ?? []).filter((id) => kindOf(id) === kind);
  // The governance chain a control sits under: Policies governing it + the
  // Regulations requiring those policies.
  const governanceFor = (controlId: string): string => {
    const policies = ofKind(linkedFrom.get(controlId), "Policy");
    const regs = new Set<string>();
    for (const p of policies) for (const r of ofKind(linkedFrom.get(p), "Regulation")) regs.add(r);
    return [...policies.map(codeName), ...[...regs].map(codeName)].join("; ");
  };

  // ── Sheet 1: Audit Grid — one row per Activity × Risk × Control (the flat,
  //    auditor-standard RCM). A risk with no control emits a single GAP row. ──
  const gridHeader = ["Process", "Activity", "Risk", "Risk score", "Residual", "Control", "Control type", "Automation", "Frequency", "Owner", "Framework", "Policy / Regulation", "Evidence", "Test method", "Test frequency", "Coverage"];
  const gridRows: (string | number)[][] = [];
  for (const ar of activityRisks) {
    const r = byId.get(ar.riskId); if (!r) continue;
    const ctrlIds = controlsForRisk.get(ar.riskId) ?? [];
    const base = [ar.process, ar.activity, `${r.code} ${r.name}`, riskScore(r) ?? "", residualScore(r) ?? ""];
    if (ctrlIds.length === 0) {
      gridRows.push([...base, "", "", "", "", "", "", "", "", "", "GAP — no control"]);
    } else {
      for (const cid of ctrlIds) {
        const c = byId.get(cid);
        gridRows.push([...base,
          c ? `${c.code} ${c.name}` : cid,
          c?.controlType ? CONTROL_TYPE_LABELS[c.controlType] : "", autoLabel(c?.automation ?? null),
          c?.frequency ?? "", c?.owner ?? "", c?.frameworkRef ?? "", governanceFor(cid),
          c?.evidence ?? "", c?.testMethod ?? "", c?.testFrequency ?? "", "Covered",
        ]);
      }
    }
  }
  if (gridRows.length === 0) gridRows.push(["—", "No risks attached to any process step yet", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);

  // ── Sheet 2: Risk-Control Matrix (one row per Risk) ──
  const rcmHeader = ["Risk", "Risk description", "Likelihood", "Impact", "Score", "Residual", "Category", "Mitigating controls", "Coverage", "Attached on"];
  const rcmRows = risks.map((r) => {
    const ctrls = (controlsForRisk.get(r.id) ?? []).map(codeName);
    return [
      `${r.code} ${r.name}`, r.description ?? "",
      r.likelihood ?? "", r.impact ?? "", riskScore(r) ?? "", residualScore(r) ?? "", r.riskCategory ?? "",
      ctrls.join("; "), ctrls.length ? "Covered" : "GAP — no control",
      attachments(r.id),
    ];
  });

  // ── Sheet 3: Control register (with audit / assurance columns) ──
  const ctlHeader = ["Control", "Description", "Type", "Automation", "Frequency", "Owner", "Framework ref", "Evidence", "Test method", "Test frequency", "Mitigates risks", "Attached on"];
  const ctlRows = controls.map((c) => [
    `${c.code} ${c.name}`, c.description ?? "",
    c.controlType ? CONTROL_TYPE_LABELS[c.controlType] : "", autoLabel(c.automation), c.frequency ?? "", c.owner ?? "", c.frameworkRef ?? "",
    c.evidence ?? "", c.testMethod ?? "", c.testFrequency ?? "",
    (risksForControl.get(c.id) ?? []).map(codeName).join("; "),
    attachments(c.id),
  ]);

  // ── Sheet 4: GRC Register — every governance object (Policies, Regulations,
  //    Audit Findings, KRIs, KPIs) with owner + framework + what it links to. ──
  const otherKinds = ["Policy", "Regulation", "AuditFinding", "KRI", "KPI"] as const;
  const regHeader = ["Kind", "Code", "Name", "Description", "Owner", "Framework ref", "Links to", "Attached on"];
  const regRows: string[][] = [];
  for (const kind of otherKinds) {
    for (const it of library.items.filter((i) => i.kind === kind)) {
      const links = [...(linkedTo.get(it.id) ?? []), ...(linkedFrom.get(it.id) ?? [])].map(codeName).join("; ");
      regRows.push([KIND_LABEL[kind], it.code, it.name, it.description ?? "", it.owner ?? "", it.frameworkRef ?? "", links, attachments(it.id)]);
    }
  }
  if (regRows.length === 0) regRows.push(["—", "", "No policies / regulations / findings / KRIs / KPIs yet", "", "", "", "", ""]);

  // ── Sheet 5: Traceability — every directed edge as "A verb B". ──
  const traceHeader = ["Source", "Source kind", "Relationship", "Target", "Target kind"];
  const traceRows = library.links.map((ln) => {
    const s = byId.get(ln.sourceId), t = byId.get(ln.targetId);
    return [
      s ? `${s.code} ${s.name}` : ln.sourceId, s ? KIND_LABEL[s.kind] : "",
      s && t ? relationVerb(s.kind, t.kind) : "relates to",
      t ? `${t.code} ${t.name}` : ln.targetId, t ? KIND_LABEL[t.kind] : "",
    ];
  });
  if (traceRows.length === 0) traceRows.push(["—", "", "no links yet", "", ""]);

  // ── Sheet 6: Coverage summary ──
  const uncovered = risks.filter((r) => !(controlsForRisk.get(r.id)?.length));
  const count = (k: string) => library.items.filter((i) => i.kind === k).length;
  const summaryRows: (string | number)[][] = [
    ["Risk-Control Matrix — coverage summary"],
    [],
    ["Library", library.name],
    ["Risks", risks.length], ["Controls", controls.length],
    ["Policies", count("Policy")], ["Regulations", count("Regulation")],
    ["Audit Findings", count("AuditFinding")], ["KRIs", count("KRI")], ["KPIs", count("KPI")],
    ["Traceability links", library.links.length],
    ["Activity × Risk × Control rows", gridRows.length],
    ["Risks with no control (coverage gaps)", uncovered.length],
    [],
    ["Coverage gaps:"],
    ...(uncovered.length ? uncovered.map((r) => [`${r.code} ${r.name}`]) : [["None — every risk has at least one control"]]),
  ];

  const sheets: Sheet[] = [
    { name: "Audit Grid", rows: [gridHeader, ...gridRows] },
    { name: "Risk-Control Matrix", rows: [rcmHeader, ...rcmRows] },
    { name: "Control Register", rows: [ctlHeader, ...ctlRows] },
    { name: "GRC Register", rows: [regHeader, ...regRows] },
    { name: "Traceability", rows: [traceHeader, ...traceRows] },
    { name: "Coverage Summary", rows: summaryRows },
  ];
  const buffer = await buildXlsx(sheets);
  const filename = `Risk-Control Matrix — ${library.name}.xlsx`;
  return { filename, buffer };
}
