/**
 * Risk & Control catalog — the adopt (org master → project copy) invariant and
 * the Risk-Control Matrix export, against the test DB. Mirrors the Entity Lists
 * own-copy test. Exercises itemOps (create + link), adoptLibrary, and
 * buildRcmXlsx end to end.
 */
import { describe, it, expect, beforeEach } from "vitest";
import JSZip from "jszip";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject } from "../_setup/factories";
import { createItem, updateItem, linkMitigation } from "@/app/lib/riskControls/itemOps";
import { adoptLibrary } from "@/app/lib/riskControls/adoptLibrary";
import { buildRcmXlsx } from "@/app/lib/riskControls/exportRcm";

async function seed() {
  const { user, org } = await createUserWithOrg();
  const project = await createProject({ userId: user.id, orgId: org.id });
  const master = await prisma.riskControlLibrary.create({ data: { name: "SOX Controls", orgId: org.id } });
  const risk = await createItem(master.id, { kind: "Risk", name: "Duplicate payment", likelihood: 3, impact: 5, riskCategory: "Financial" });
  const control = await createItem(master.id, { kind: "Control", name: "Two-person approval", controlType: "Preventive", owner: "Finance", frameworkRef: "SOX 404" });
  await linkMitigation(master.id, control.id, risk.id);
  return { user, org, project, master, risk, control };
}
type World = Awaited<ReturnType<typeof seed>>;

describe("risk & control — adopt + RCM export", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  it("T0630 — adopt clones the library into a SEPARATE project copy with items + links re-linked", async () => {
    const res = await adoptLibrary(w.project.id, w.org.id, w.master.id);
    expect(res.itemCount).toBe(2);
    expect(res.linkCount).toBe(1);

    const copy = await prisma.riskControlLibrary.findFirst({ where: { projectId: w.project.id }, include: { items: true, links: true } });
    expect(copy).toBeTruthy();
    expect(copy!.orgId).toBeNull();
    expect(copy!.sourceLibraryId).toBe(w.master.id);   // provenance only
    expect(copy!.id).not.toBe(w.master.id);

    // Items are NEW rows (distinct ids), attributes preserved.
    expect(copy!.items).toHaveLength(2);
    for (const it of copy!.items) expect([w.risk.id, w.control.id]).not.toContain(it.id);
    const copyRisk = copy!.items.find((i) => i.kind === "Risk")!;
    const copyControl = copy!.items.find((i) => i.kind === "Control")!;
    expect(copyRisk.impact).toBe(5);
    expect(copyControl.frameworkRef).toBe("SOX 404");

    // The mitigation link points at the COPY's item ids (re-linked, not dangling).
    expect(copy!.links).toHaveLength(1);
    expect(copy!.links[0].controlId).toBe(copyControl.id);
    expect(copy!.links[0].riskId).toBe(copyRisk.id);

    // Editing the master afterwards does not touch the copy.
    await prisma.riskControlItem.update({ where: { id: w.risk.id }, data: { name: "CHANGED" } });
    const stillRisk = await prisma.riskControlItem.findUnique({ where: { id: copyRisk.id } });
    expect(stillRisk!.name).toBe("Duplicate payment");
  });

  it("T0631 — the Risk-Control Matrix export reflects on-model attachments + coverage", async () => {
    await adoptLibrary(w.project.id, w.org.id, w.master.id);
    const lib = await prisma.riskControlLibrary.findFirst({ where: { projectId: w.project.id }, include: { items: true } });
    const covRisk = lib!.items.find((i) => i.kind === "Risk")!;
    const covControl = lib!.items.find((i) => i.kind === "Control")!;
    // A second risk with NO control → a coverage gap.
    const gapRisk = await createItem(lib!.id, { kind: "Risk", name: "Unauthorised change", likelihood: 2, impact: 4 });

    // Attach the covered risk + its control to a task on a diagram in the project.
    await prisma.diagram.create({
      data: {
        name: "Payments", type: "bpmn", userId: w.user.id, diagramOwnerId: w.user.id, orgId: w.org.id, projectId: w.project.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          elements: [{ id: "t1", type: "task", x: 0, y: 0, width: 100, height: 60, label: "Pay invoice",
            properties: { risk: { riskRefs: [{ itemId: covRisk.id, code: covRisk.code, label: covRisk.name }], controlRefs: [{ itemId: covControl.id, code: covControl.code, label: covControl.name }] } } }],
          connectors: [],
        } as any,
      },
    });

    const rcm = await buildRcmXlsx(w.project.id);
    expect(rcm).toBeTruthy();
    const z = await JSZip.loadAsync(rcm!.buffer);
    // Sheet 2 = the risk-centric Risk-Control Matrix.
    const matrix = await z.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(matrix).toContain(covControl.code);
    expect(matrix).toContain("Covered");
    expect(matrix).toContain("Payments — Pay invoice");   // "Attached on" column
    expect(matrix).toContain(gapRisk.name);
    expect(matrix).toContain("GAP — no control");
  });

  it("T0632 — the flat Audit Grid has one Activity×Risk×Control row carrying the audit/assurance columns", async () => {
    await adoptLibrary(w.project.id, w.org.id, w.master.id);
    const lib = await prisma.riskControlLibrary.findFirst({ where: { projectId: w.project.id }, include: { items: true } });
    const risk = lib!.items.find((i) => i.kind === "Risk")!;
    const control = lib!.items.find((i) => i.kind === "Control")!;
    // Fill the audit/assurance + residual fields.
    await updateItem(lib!.id, control.id, { automation: "Automated", evidence: "ERP approval log", testMethod: "Sample 25 approvals", testFrequency: "Quarterly" });
    await updateItem(lib!.id, risk.id, { residualLikelihood: 1, residualImpact: 2 });

    await prisma.diagram.create({
      data: {
        name: "Payments", type: "bpmn", userId: w.user.id, diagramOwnerId: w.user.id, orgId: w.org.id, projectId: w.project.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          elements: [{ id: "t1", type: "task", x: 0, y: 0, width: 100, height: 60, label: "Approve invoice",
            properties: { risk: { riskRefs: [{ itemId: risk.id, code: risk.code, label: risk.name }] } } }],
          connectors: [],
        } as any,
      },
    });

    const rcm = await buildRcmXlsx(w.project.id);
    const z = await JSZip.loadAsync(rcm!.buffer);
    const grid = await z.file("xl/worksheets/sheet1.xml")!.async("string");  // Audit Grid
    // The mature audit columns + the row's data.
    for (const s of ["Process", "Activity", "Test method", "Automation", "Residual"]) expect(grid).toContain(`>${s}</t>`);
    expect(grid).toContain("Approve invoice");                       // Activity (own column)
    expect(grid).toContain("Automated");
    expect(grid).toContain("ERP approval log");                      // evidence
    expect(grid).toContain("Sample 25 approvals");                   // test method
    expect(grid).toContain("Quarterly");                             // test frequency
    expect(grid).toContain(control.code);                            // the mitigating control on this activity
    expect(grid).toContain("Covered");
    expect(grid).toContain("<v>2</v>");                              // residual score = 1 × 2 (numeric cell)
  });
});
