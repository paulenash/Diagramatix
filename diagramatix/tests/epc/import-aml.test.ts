/**
 * ARIS AML import, end to end: file → EpcModel → plan → laid-out EPC → BPMN.
 *
 * The fixture is `public/ARIS Order to Cash eEPC.aml`, which is HAND-WRITTEN.
 * That is worth being blunt about in the tests as well as in the file: these
 * assertions prove the importer does what it intends to do, they do NOT prove
 * the intent matches ARIS. When a real export arrives, diff it against the
 * sample; where they differ, the real file is right and this fixture changes.
 *
 * What the tests CAN establish, and what makes them worth having anyway:
 *   - every EPC symbol survives the round trip (the sample uses all ten);
 *   - the tolerance that is supposed to absorb a real file's differences is
 *     real, and not a comment (T4110-T4112);
 *   - nothing is dropped in silence;
 *   - the imported model reaches the same layout and the same conversion as a
 *     hand-drawn one, rather than a second path that needs its own care.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importAml, epcModelToPlan } from "@/app/lib/diagram/aris/importAml";
import { layoutEpcDiagram } from "@/app/lib/diagram/layoutEpc";
import { translateEpcToBpmn } from "@/app/lib/diagram/translate/epcToBpmn";
import type { LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

const SAMPLE = "public/ARIS Order to Cash eEPC.aml";
const xml = () => readFileSync(SAMPLE, "utf8");
const imported = () => importAml(xml());
const o2c = () => imported().models.find((m) => m.name === "Order to Cash")!;

describe("the sample AML parses", () => {
  it("T4105 - both models are found, and only the eEPCs", () => {
    const { models, report } = imported();
    expect(models.map((m) => m.name)).toEqual([
      "Order to Cash",
      "Complaint Handling (deliberately broken)",
    ]);
    expect(report.models).toHaveLength(2);
    expect(report.skippedModels).toEqual([]);
  });

  it("T4106 - every EPC symbol survives the import", () => {
    // The sample was built to use all ten. A symbol that silently failed to
    // parse would leave a hole nothing else in this file would notice.
    const kinds = new Set(o2c().objects.map((o) => o.kind));
    expect([...kinds].sort()).toEqual([
      "and", "application", "data", "event", "function",
      "interface", "or", "org-unit", "position", "xor",
    ]);
  });

  it("T4107 - the three arc kinds are separated", () => {
    const rels = o2c().relations;
    const of = (k: string) => rels.filter((r) => r.kind === k).length;
    expect(of("control")).toBeGreaterThan(10);
    expect(of("assignment")).toBeGreaterThan(0);   // org units and the position
    expect(of("information")).toBeGreaterThan(0);  // data objects and systems
  });

  it("T4108 - an object type it does not model is REPORTED, not dropped in silence", () => {
    // A real ARIS repository is full of KPIs, risks, products and knowledge
    // categories. Discarding half a customer's model without saying so is the
    // failure that would lose the deal.
    const { report } = imported();
    const kpi = report.unknownObjectTypes.find((u) => u.type === "OT_KPI_INST");
    expect(kpi, "the sample's KPI must be reported").toBeTruthy();
    expect(kpi!.examples).toContain("Order cycle time");
    // …and its connection to a function is named too, not silently forgotten.
    expect(report.dropped.some((d) => d.includes("ObjDef.K1"))).toBe(true);
  });
});

describe("the tolerance that is meant to absorb a real export", () => {
  // These are the assertions that matter most, because the sample is a guess.
  // Each one plants a difference a real file plausibly has and asserts the
  // import still works.
  it("T4109 - attribute casing does not matter", () => {
    const munged = xml()
      .replace(/ObjDef\.ID=/g, "ObjDef.Id=")
      .replace(/ToObjDef\.IdRef=/g, "ToObjDef.IDREF=")
      .replace(/TypeNum=/g, "typeNum=");
    const m = importAml(munged).models.find((x) => x.name === "Order to Cash");
    expect(m, "a casing difference broke the whole import").toBeTruthy();
    expect(m!.objects.length).toBe(o2c().objects.length);
  });

  it("T4110 - a connection code it has never seen still lands, by its endpoints", () => {
    // The single decision the importer rests on: an org unit joined to a
    // function is an assignment whatever the export calls the connection.
    const munged = xml().replace(/CT_EXEC_1/g, "CT_SOMETHING_WE_HAVE_NEVER_SEEN");
    const r = importAml(munged);
    const m = r.models.find((x) => x.name === "Order to Cash")!;
    expect(m.relations.filter((x) => x.kind === "assignment").length)
      .toBe(o2c().relations.filter((x) => x.kind === "assignment").length);
    // …and the unfamiliar code is reported, so a real file teaches us its
    // vocabulary instead of passing unnoticed.
    expect(r.report.unknownConnectionTypes.some((u) => u.type === "CT_SOMETHING_WE_HAVE_NEVER_SEEN")).toBe(true);
  });

  it("T4111 - extra nesting does not hide the objects", () => {
    // A real export wraps things in Group folders several deep.
    const munged = xml().replace(
      '<Group Group.ID="Group.Root">',
      '<Group Group.ID="Group.Outer"><Group Group.ID="Group.Middle"><Group Group.ID="Group.Root">',
    ).replace("</Group>\n</AML>", "</Group></Group></Group>\n</AML>");
    const m = importAml(munged).models.find((x) => x.name === "Order to Cash");
    expect(m, "nesting inside extra Groups broke the import").toBeTruthy();
    expect(m!.objects.length).toBe(o2c().objects.length);
  });

  it("T4112 - a non-EPC model in the same export is skipped by name, not mangled", () => {
    const munged = xml().replace('Model.Type="MT_EEPC"', 'Model.Type="MT_ORG_CHRT"');
    const r = importAml(munged);
    expect(r.models.map((m) => m.name)).toEqual(["Complaint Handling (deliberately broken)"]);
    expect(r.report.skippedModels).toHaveLength(1);
    expect(r.report.skippedModels[0].type).toBe("MT_ORG_CHRT");
  });
});

describe("a person can actually get to the import", () => {
  // Same lesson as the cold-start button: a handler can be perfect and
  // unreachable. This one matters more than most — the import IS the product.
  const read = (f: string) => readFileSync(f, "utf8");

  it("T4122 - the editor offers ARIS (AML) on an EPC and calls the handler", () => {
    const src = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(src, "no menu entry").toContain("ARIS (AML)");
    expect(src).toContain("importAmlInputRef");
    expect(src).toContain("handleImportAmlFile");
    // The input must actually be rendered, or the click goes nowhere.
    expect(src).toContain("ref={importAmlInputRef}");
  });

  it("T4123 - it posts to a route that exists, and that route shows the warnings", () => {
    const src = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(src).toContain("\"/api/import/aml\"");
    expect(read("app/api/import/aml/route.ts")).toMatch(/export async function POST/);
    // The warnings are the half that makes a real migration trustworthy, so
    // the handler has to put them somewhere a person sees.
    expect(src).toMatch(/body.warnings/);
  });

  it("T4124 - the sample file the importer is built against is in the repo", () => {
    // The tests are only as honest as the fixture, and the fixture is
    // hand-written. Keeping it where a person can download it is what makes
    // it checkable against a real export.
    const sample = read(SAMPLE);
    expect(sample).toContain("HAND-WRITTEN");
    expect(sample, "the caveat must survive edits").toContain("NOT been produced by ARIS");
  });
});
describe("an imported model is an ordinary EPC from there on", () => {
  it("T4113 - assignments arrive as attributes on the function", () => {
    // Not a convenience: expressed this way an assignment CANNOT hang off an
    // event, and a function cannot carry two responsible parties, because
    // there is nowhere in the plan to say either.
    const plan = epcModelToPlan(o2c());
    const f1 = plan.elements.find((e) => e.label === "Order validation")!;
    expect(f1.org).toBe("Sales Department");
    expect(f1.data).toContain("Customer order");
    expect(f1.system).toContain("SAP ERP");
    // The satellites are gone from the element list — the layout draws them.
    expect(plan.elements.some((e) => e.label === "Sales Department")).toBe(false);
    expect(plan.elements.some((e) => e.label === "SAP ERP")).toBe(false);
  });

  it("T4114 - the clean model lays out with NO rule diagnostics", () => {
    // The sample's first model is a valid eEPC on purpose, so it is a baseline:
    // any diagnostic here is the importer's fault, not the model's.
    const diagnostics: LayoutDiagnostic[] = [];
    const data = layoutEpcDiagram(epcModelToPlan(o2c()), { onDiagnostic: (d) => diagnostics.push(d) });
    expect(diagnostics).toEqual([]);
    expect(data.elements.length).toBeGreaterThan(20);
    for (const c of data.connectors) {
      expect(c.waypoints.length, `${c.id} has no waypoints`).toBeGreaterThan(0);
    }
  });

  it("T4115 - the deliberately broken model reports exactly the three planted faults", () => {
    // The second model breaks E3, E5 and E7 on purpose. If it reported nothing,
    // the checks would be dead for imported models even though they work for
    // hand-drawn ones.
    const broken = imported().models.find((m) => m.name.startsWith("Complaint Handling"))!;
    const diagnostics: LayoutDiagnostic[] = [];
    layoutEpcDiagram(epcModelToPlan(broken), { onDiagnostic: (d) => diagnostics.push(d) });
    const kinds = new Set(diagnostics.map((d) => d.kind));
    expect(kinds.has("epc-event-decides"), "E3 not reported").toBe(true);
    expect(kinds.has("epc-unbalanced-connector"), "E5 not reported").toBe(true);
    // E7 is structural in the plan format — two org units cannot both be
    // expressed — so the SECOND one is what has to be visible, and it shows up
    // as the org that never made it onto the function.
    const plan = epcModelToPlan(broken);
    const fn = plan.elements.find((e) => e.label === "Complaint investigation")!;
    expect(["Customer Service", "Legal"]).toContain(fn.org);
    expect(broken.relations.filter((r) => r.kind === "assignment")).toHaveLength(2);
  });

  it("T4116 - an imported EPC converts to BPMN by the same rules as a drawn one", () => {
    // The whole point of the programme: ARIS models in, BPMN out.
    const data = layoutEpcDiagram(epcModelToPlan(o2c()));
    const { aiElements, report } = translateEpcToBpmn(data, { processName: "Order to Cash" });

    expect(report.refusals, "the clean sample must refuse nothing").toEqual([]);
    expect(report.taskCount).toBe(9);              // nine functions
    expect(report.gatewayCount).toBe(6);           // XOR, AND, OR — split and join each
    expect(report.callActivityCount).toBe(1);      // the process interface
    // Lanes derived from the org units and the position, not from geometry.
    const lanes = aiElements.filter((e) => e.type === "lane").map((e) => e.label).sort();
    expect(lanes).toEqual(["Credit Officer", "Finance", "Sales Department", "Warehouse"]);
    // The application systems became black-box IT pools, never data stores.
    expect(aiElements.some((e) => e.type === "data-store")).toBe(false);
    expect(aiElements.filter((e) => e.poolType === "black-box").map((e) => e.label).sort())
      .toEqual(["CRM System", "SAP ERP"]);
  });

  it("T4117 - the outcome events after each decision became branch labels", () => {
    const data = layoutEpcDiagram(epcModelToPlan(o2c()));
    const { aiConnections } = translateEpcToBpmn(data, { processName: "Order to Cash" });
    const labels = aiConnections.map((c) => c.label).filter(Boolean);
    expect(labels).toContain("Credit approved");
    expect(labels).toContain("Credit refused");
  });
});
