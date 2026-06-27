/**
 * Global hint for the screenshot tool: the diagram currently open in the editor.
 * The capture button lives in the root layout — above DiagramEditor in the tree —
 * so React context can't reach it. DiagramEditor sets this in an effect; the
 * capture reads it (non-reactively) at the moment of capture.
 */
let currentDiagramName: string | null = null;

export function setCurrentDiagramName(name: string | null) {
  currentDiagramName = name && name.trim() ? name.trim() : null;
}

export function getCurrentDiagramName(): string | null {
  return currentDiagramName;
}
