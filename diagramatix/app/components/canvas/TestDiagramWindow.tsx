"use client";
/**
 * The Voice Assist test diagram, in a window — drawn by the editor's own canvas,
 * read-only (the SnapshotCanvas pattern), so what is shown is exactly what a
 * copy will look like.
 *
 * Paul, 2026-09-27: "a popup window with a 'Close' button, and a 'Create test
 * diagram' button". Creating is the editor's job (it knows the project and
 * saves the current diagram first); this window only asks.
 */
import { useMemo } from "react";
import { Canvas } from "./Canvas";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { TEST_DIAGRAM_NAME } from "@/app/lib/assist/testDiagram";

const noop = () => {};
const centreStub = () => ({ x: 0, y: 0 });

export function TestDiagramWindow({
  onClose,
  onCreate,
  creating = false,
  error = null,
  canCreate = true,
}: {
  onClose: () => void;
  onCreate: () => void;
  creating?: boolean;
  error?: string | null;
  /** False in a read-only editor: there is nowhere to save the current diagram first. */
  canCreate?: boolean;
}) {
  const data = useMemo(() => fixtureDiagram(), []);
  const none = useMemo(() => new Set<string>(), []);
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[90]" onMouseDown={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{TEST_DIAGRAM_NAME}</h3>
            <p className="text-xs text-gray-500">
              Every example on the Commands card names something on this diagram. Create a copy in this project to say them as written.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && (
              <button onClick={onCreate} disabled={creating}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
                {creating ? "Creating…" : "Create test diagram"}
              </button>
            )}
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-[28rem] flex overflow-hidden">
          <Canvas
            data={data}
            diagramType="bpmn"
            readOnly
            onAddElement={noop}
            onMoveElement={noop}
            onResizeElement={noop}
            onUpdateLabel={noop}
            onDeleteElement={noop}
            onAddConnector={noop}
            onDeleteConnector={noop}
            onUpdateConnectorEndpoint={noop}
            selectedElementIds={none}
            selectedConnectorId={null}
            onSetSelectedElements={noop}
            onSelectConnector={noop}
            pendingDragSymbol={null}
            defaultDirectionType="directed"
            defaultRoutingType="rectilinear"
            getViewportCenterRef={{ current: centreStub }}
          />
        </div>
        {error && <p className="px-5 py-2 text-xs text-red-600 border-t border-gray-100">{error}</p>}
      </div>
    </div>
  );
}
