/**
 * "Show test diagram" / "Create test diagram" — the diagram every Commands-card
 * example is written for, put in front of the user.
 *
 * Paul, 2026-09-27: "Add 'Show test diagram' button which allows the user to
 * see the diagram in a popup window with a 'Close' button, and a 'Create test
 * diagram' button which should create the diagram in the current Project, save
 * the current diagram and take the user to the newly created test diagram."
 *
 * The card's examples name THIS diagram's elements (catalogCorpus.ts), so on a
 * copy of it every line can be said as written.
 *
 * Pure.
 */
import { fixtureDiagram } from "./commandFixture";
import type { DiagramData } from "../diagram/types";

export const TEST_DIAGRAM_NAME = "Voice Assist test diagram";

/** The body for POST /api/diagrams: a fresh copy of the test diagram, in the given project. */
export function testDiagramCreateBody(projectId: string | null): {
  name: string;
  type: "bpmn";
  projectId?: string;
  data: DiagramData;
  displayMode: "normal";
} {
  return {
    name: TEST_DIAGRAM_NAME,
    type: "bpmn",
    ...(projectId ? { projectId } : {}),
    data: fixtureDiagram(),
    displayMode: "normal",
  };
}
