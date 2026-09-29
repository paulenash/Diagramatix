/**
 * Stage 4 of mobile voice — the harness works: the voice session (cut from
 * TODAY's editor until the move, the moved hook after) runs under real React
 * with the real useDiagram.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { runningAgainst } from "./loadVoiceSession";
import { editorSource } from "../diagram/assistApplySource";

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  stubFetch(() => ({ ops: [] }));
});
afterEach(async () => {
  await unmountAll();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

/**
 * The editor's glue for the refs the session reads — harness.ts copies these
 * lines by hand (the session's host is built from them), so both must still
 * say exactly this. After the move they stay in DiagramEditor.tsx, outside the hook.
 */
const GLUE_LINES = [
  "const selectedIdsRef = useRef<string[]>([]);",
  "selectedIdsRef.current = [...selectedElementIds];",
  "const elementsRef = useRef(data.elements);",
  "elementsRef.current = data.elements;",
  "const connectorsRef = useRef(data.connectors);",
  "connectorsRef.current = data.connectors;",
  "const selectedConnectorIdRef = useRef<string | null>(null);",
  "selectedConnectorIdRef.current = selectedConnectorId;",
];

describe("the voice session harness", () => {
  it(`runs the session (${runningAgainst()}) — a typed grammar command edits the diagram and logs one line carrying its ops`, async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete Pay supplier");
    expect(h.data.elements.some((e) => e.label === "Pay supplier")).toBe(false);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine?.ops?.length ?? 0).toBeGreaterThan(0);
    await h.unmount();
  });

  it("the harness's glue lines are the editor's, word for word — the harness cannot drift from the editor unnoticed", () => {
    const editorLines = new Set(editorSource().replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()));
    const harnessLines = new Set(readFileSync(join(process.cwd(), "tests", "voice-session", "harness.ts"), "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()));
    expect(GLUE_LINES.filter((l) => !editorLines.has(l)), "glue lines no longer in DiagramEditor.tsx — update harness.ts to match").toEqual([]);
    expect(GLUE_LINES.filter((l) => !harnessLines.has(l)), "glue lines missing from harness.ts").toEqual([]);
  });

  it("the console guard is not blind: a state update outside act is recorded, and failOnActWarnings throws once, then is clear", async () => {
    const h = await mountSession({ initial: threeTasks() });
    h.d.updateLabel("t1", "Take order");          // deliberately outside act
    await h.act(() => undefined);                 // let it render before the check
    expect(() => failOnActWarnings()).toThrow(/not wrapped in act/);
    expect(() => failOnActWarnings()).not.toThrow();
  });

  it("the stub window removes a capture listener added with a boolean (as a browser does)", () => {
    const win = window as unknown as EventTarget;
    let heard = 0;
    const onDown = () => { heard++; };
    win.addEventListener("mousedown", onDown, true);
    win.dispatchEvent(new Event("mousedown"));
    win.removeEventListener("mousedown", onDown, true);
    win.dispatchEvent(new Event("mousedown"));
    expect(heard).toBe(1);
  });
});
