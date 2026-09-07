import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The doorstep of the Simulator.
 *
 * Paul, 2026-09-07: after choosing a Simulation Example, land on the new project
 * as now, then ask — "This is the Simulation Example, <Name>, home Project. Do
 * you want to enter the Simulator immediately or explore the Project first?"
 *
 * Someone who chose a simulation example came to see a simulation, and the
 * project page gives no clue which of its dozen buttons is the point.
 *
 * Rendering the whole project client to test this would need the project, its
 * diagrams, its entitlements and a router; the risks that actually matter are
 * all in the wiring, and each is checkable at the source: the NAME has to reach
 * the project, and the parameter has to be CLEARED, or a reload asks again for
 * ever.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const GALLERY = "app/(dashboard)/dashboard/simulator-examples/ExamplesGallery.tsx";
const PROJECT = "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx";

describe("loading a Simulation Example offers the Simulator", () => {
  it("T3357 the gallery still lands on the project, and carries the example's name", () => {
    const src = read(GALLERY);
    expect(src, "it must still go to the project, not into a diagram")
      .toContain("router.push(`/dashboard/projects/${json.projectId}`");
    expect(src).toContain("simExample=");
    // Encoded, because these titles have spaces and ampersands in them.
    expect(src).toContain("encodeURIComponent");
  });

  it("T3358 the project reads the name and CLEARS the parameter", () => {
    // Without the clear, a reload — or a bookmark, or the back button — asks the
    // same question again for ever, on a project that stopped being new days ago.
    const src = read(PROJECT);
    expect(src).toContain(`searchParams.get("simExample")`);
    expect(src).toContain(`searchParams.delete("simExample")`);
    expect(src).toContain("history.replaceState");
  });

  it("T3359 it says what Paul asked it to say, in those words", () => {
    const src = read(PROJECT);
    expect(src).toContain("This is the Simulation Example");
    expect(src).toContain("home Project");
    expect(src).toContain("enter the Simulator immediately or explore the Project first");
    expect(src).toContain("Enter the Simulator");
    expect(src).toContain("Explore Project");
  });

  it("T3360 both answers do something, and neither leaves the dialog up", () => {
    const src = read(PROJECT);
    // Enter → close the greeting AND open the simulator.
    expect(src).toContain("setSimExample(null); setShowSim(true);");
    // Explore → close the greeting and nothing else.
    expect(src).toContain("onClick={() => setSimExample(null)}");
  });

  it("T3361 it is green, and it is not a browser dialog", () => {
    // window.confirm is banned in this codebase, and would have been the quick
    // way to ask a two-option question. It is also the wrong tone: this one is
    // the Simulator's own colours, because that is what it is offering.
    const src = read(PROJECT);
    const block = src.slice(src.indexOf("SIMULATION EXAMPLE") - 2000, src.indexOf("SIMULATION EXAMPLE") + 2000);
    expect(block).toContain("text-green-400");
    expect(block).toContain("font-mono");
    expect(src).not.toMatch(/window\.confirm\s*\(/);
  });
});
