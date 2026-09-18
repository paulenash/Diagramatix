/**
 * The rest of the "silently overwrites somebody else's work" family: DATA-36,
 * DATA-37, DATA-38 and DATA-39.
 *
 * All four are the same shape as DATA-40 — read something, think about it, write
 * the whole thing back over whatever happened in between — in four different
 * places. Three of them are answered by routing through the shared writer or by
 * copying its contract; the fourth (the SOP document) needed the contract
 * extending to a second table.
 *
 * DATA-38 is deliberately NOT given its own new code here: `clearDanglingLinksTo`
 * now goes through `updateDiagramData`, so it is covered by that module's tests
 * and by the assertion below that it no longer holds a copy of the row.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeSimProperties } from "@/app/lib/simulation/mergeSimProperties";
import type { DiagramData } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const el = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, type: "task", label: id, x: 0, y: 0, width: 102, height: 65, properties: {}, ...over });
const diagram = (els: unknown[]): DiagramData =>
  ({ elements: els, connectors: [] }) as unknown as DiagramData;

describe("T4529 — the simulator Fill stops overwriting a child diagram", () => {
  it("lays the simulation parameters over what is actually there", () => {
    // The fill only ever sets `properties.sim`, so that is the only thing worth
    // writing back. Everything else on the fresh row survives.
    const fresh = diagram([el("a", { x: 900, y: 40, label: "Renamed by someone else" })]);
    const filled = diagram([el("a", { x: 0, y: 0, label: "Old name", properties: { sim: { cycleTime: 5 } } })]);
    const out = mergeSimProperties(fresh, filled);
    const merged = out.data.elements[0] as unknown as { x: number; label: string; properties: { sim: unknown } };
    expect(merged.properties.sim, "the parameters are applied").toEqual({ cycleTime: 5 });
    expect(merged.x, "and their move is kept").toBe(900);
    expect(merged.label, "and their rename").toBe("Renamed by someone else");
    expect(out.applied).toBe(1);
  });

  it("keeps elements added since the console opened", () => {
    const fresh = diagram([el("a"), el("new-since")]);
    const filled = diagram([el("a", { properties: { sim: { cycleTime: 5 } } })]);
    const out = mergeSimProperties(fresh, filled);
    expect(out.data.elements.map((e) => (e as { id: string }).id)).toEqual(["a", "new-since"]);
  });

  it("does not resurrect an element somebody deleted", () => {
    const fresh = diagram([el("a")]);
    const filled = diagram([el("a", { properties: { sim: { cycleTime: 5 } } }), el("deleted", { properties: { sim: { cycleTime: 9 } } })]);
    const out = mergeSimProperties(fresh, filled);
    expect(out.data.elements).toHaveLength(1);
  });

  it("reports nothing applied when the parameters already match", () => {
    // The caller uses this to skip the write entirely, so a Fill that changes
    // nothing does not bump anyone's version or touch updatedAt.
    const same = diagram([el("a", { properties: { sim: { cycleTime: 5 } } })]);
    expect(mergeSimProperties(same, same).applied).toBe(0);
  });

  it("is wired in, with a version and no unconditional flag", () => {
    const src = read("app", "components", "simulation", "SimulatorConsole.tsx");
    expect(src).toContain("mergeSimProperties(row.data, data)");
    expect(src).toContain("version: row.version");
    expect(src, "the flag that bypassed the guard is gone from the Fill path")
      .not.toMatch(/body: JSON\.stringify\(\{ data, unconditional: true \}\)/);
  });
});

describe("T4530 — a SOP save cannot silently destroy another editor's sections", () => {
  const route = read("app", "api", "sop", "[id]", "route.ts");

  it("refuses a section save that carries no version", () => {
    // The save DELETES every section and recreates them, so without a token
    // there is no way to tell a legitimate save from one built on stale data.
    expect(route).toContain('error: "version-required"');
    expect(route).toContain("sections && clientVersion === null");
  });

  it("guards the write with a compare-and-swap, not a plain update", () => {
    expect(route).toContain("updateMany({");
    expect(route).toContain("where: { id, version: clientVersion! }");
    expect(route).toContain("version: { increment: 1 }");
  });

  it("answers 409 with the document that is actually there", () => {
    expect(route).toContain('error: "conflict"');
    expect(route).toContain("{ status: 409 }");
    expect(route).toContain("currentVersion");
    // And the branch is actually reachable. A 409 body that nothing can reach
    // reads exactly like a 409 body that works.
    expect(route).toContain("if (conflict) {");
    expect(route).toContain("conflict = true; return;");
  });

  it("leaves a title-only save alone", () => {
    // Renaming a SOP touches no sections, so demanding a version there would be
    // friction for nothing.
    expect(route).toContain("} else if (title !== undefined || status !== undefined) {");
  });

  it("has the column to compare against", () => {
    const schema = read("prisma", "schema.prisma");
    const model = schema.slice(schema.indexOf("model SopDocument"), schema.indexOf("model SopSection"));
    expect(model).toMatch(/version\s+Int\s+@default\(0\)/);
  });

  it("is sent by the editor, which keeps its work when it is refused", () => {
    const client = read("app", "(dashboard)", "dashboard", "projects", "[id]", "sop", "[sopId]", "SopEditorClient.tsx");
    expect(client).toContain("version: versionRef.current");
    expect(client).toContain("res.status === 409");
    // Silence is what made the old behaviour dangerous — it destroyed their work
    // and returned 200.
    expect(client).toContain("Someone else saved this SOP");
  });
});

describe("T4531 — the mining and archive writers read inside the guarded step", () => {
  it("clears a dangling link without holding a copy of the sibling", () => {
    const src = read("app", "lib", "archive.ts");
    expect(src).toContain("await updateDiagramData(sib.id,");
    expect(src, "it must not select the blob it is about to overwrite")
      .not.toMatch(/findMany\(\{[\s\S]{0,200}select: \{ id: true, data: true \}/);
  });

  it("calibrates against the diagram's current contents", () => {
    // The calibration is computed FROM the diagram, so it is a read-modify-write
    // and belongs on the guarded path — otherwise it writes the copy read at the
    // top of the route and reverts anyone who edited in between.
    const src = read("app", "api", "projects", "[id]", "mining", "runs", "[runId]", "calibrate", "route.ts");
    expect(src).toContain("await updateDiagramData(bpmnId,");
    expect(src).toContain("calibrateSimulation(current, perf)");
  });

  it("still bumps the version on every mining write", () => {
    // DATA-39's own half: the editor's compare-and-swap only fires if the
    // version moves, so a mining write that left it alone was invisible.
    const store = read("app", "lib", "mining", "diagramStore.ts");
    expect(store).toContain("setDiagramData(");
    const writer = read("app", "lib", "diagram", "updateDiagramData.ts");
    expect(writer).toContain("version = version + 1");
  });
});
