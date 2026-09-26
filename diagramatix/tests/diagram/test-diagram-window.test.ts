/**
 * "Show test diagram" and "Create test diagram" (Paul, 2026-09-27): "Add 'Show
 * test diagram' button which allows the user to see the diagram in a popup
 * window with a 'Close' button, and a 'Create test diagram' button which should
 * create the diagram in the current Project, save the current diagram and take
 * the user to the newly created test diagram."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { testDiagramCreateBody, TEST_DIAGRAM_NAME } from "@/app/lib/assist/testDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";

const read = (p: string) => readFileSync(p, "utf8");

describe("T_TD — the test diagram: shown in a window, and created in the current project", () => {
  it("the create request is a fresh copy of the test diagram, in the given project", () => {
    const body = testDiagramCreateBody("proj-1");
    expect(body).toMatchObject({ name: TEST_DIAGRAM_NAME, type: "bpmn", projectId: "proj-1", displayMode: "normal" });
    expect(body.data.elements).toEqual(fixtureDiagram().elements);
    expect(body.data.connectors).toEqual(fixtureDiagram().connectors);
    body.data.elements[0].label = "changed";
    expect(testDiagramCreateBody("proj-1").data.elements[0].label, "each copy is its own").not.toBe("changed");
    expect(testDiagramCreateBody(null)).not.toHaveProperty("projectId");
  });

  it("the bar has the button, and the editor owns the window", () => {
    const bar = read("app/components/canvas/VoiceAssistBar.tsx");
    expect(bar).toContain("onTestDiagram && (");
    expect(bar).toContain(">Test diagram</button>");
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("onTestDiagram={() => setTestDiagram({ open: true, creating: false, error: null })}");
    expect(editor).toContain("<TestDiagramWindow");
    expect(editor).toContain("canCreate={!readOnly}");
  });

  it("Create saves the current diagram FIRST, then creates the copy in this project, then opens it", () => {
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    const fn = editor.slice(editor.indexOf("async function createTestDiagram()"), editor.indexOf("async function handleSaveAs()"));
    const saved = fn.indexOf("await saveNowRef.current();");
    const posted = fn.indexOf("body: JSON.stringify(testDiagramCreateBody(projectId)),");
    const opened = fn.indexOf("router.push(`/diagram/${created.id}`);");
    expect(saved).toBeGreaterThan(-1);
    expect(posted).toBeGreaterThan(saved);
    expect(opened).toBeGreaterThan(posted);
  });

  it("the window draws the diagram read-only, with Close and Create test diagram", () => {
    const win = read("app/components/canvas/TestDiagramWindow.tsx");
    expect(win).toContain("fixtureDiagram()");
    expect(win).toMatch(/^\s+readOnly\r?$/m);
    expect(win).toContain(">\n              Close\n");
    expect(win).toContain("\"Create test diagram\"");
    expect(win, "no browser dialogs").not.toMatch(/\b(?:alert|confirm|prompt)\(/);
  });
});
