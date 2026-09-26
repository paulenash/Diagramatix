"use client";
/**
 * One saved voice-debug state, drawn by the editor's own canvas, read-only.
 *
 * Paul, 2026-09-26, chose this over a simplified drawing: it is the renderer
 * the editor uses, so what is drawn is what he saw — zoomable, and with the
 * numbered badges redrawn from `renameBadges`, which is the one thing only the
 * old pictures used to show. The ProcessView pattern: `readOnly`, every
 * mutation a no-op.
 *
 * The default export is what VoiceDebugClient loads lazily, one snapshot at a
 * time — the canvas is the largest component in the product, and most visits
 * to the session list never draw a diagram.
 */
import { useMemo } from "react";
import { Canvas } from "@/app/components/canvas/Canvas";
import type { SnapshotReading } from "@/app/lib/assist/debugSessionFile";

const noop = () => {};
const centreStub = () => ({ x: 0, y: 0 });

export default function SnapshotCanvas({ reading }: { reading: SnapshotReading }) {
  const ui = reading.meta?.ui;
  // The selection is part of what was on screen, and "rename selected" means
  // nothing without it.
  const selected = useMemo(() => new Set(ui?.selectedIds ?? []), [ui]);
  return (
    <div className="flex h-[24rem] mt-1 border border-gray-200 rounded overflow-hidden">
      <Canvas
        data={reading.data}
        diagramType={reading.diagramType}
        readOnly
        colorConfig={reading.colorConfig}
        displayMode={reading.displayMode}
        renameBadges={ui?.badges ?? undefined}
        onAddElement={noop}
        onMoveElement={noop}
        onResizeElement={noop}
        onUpdateLabel={noop}
        onDeleteElement={noop}
        onAddConnector={noop}
        onDeleteConnector={noop}
        onUpdateConnectorEndpoint={noop}
        selectedElementIds={selected}
        selectedConnectorId={ui?.selectedConnectorId ?? null}
        onSetSelectedElements={noop}
        onSelectConnector={noop}
        pendingDragSymbol={null}
        defaultDirectionType="directed"
        defaultRoutingType="rectilinear"
        getViewportCenterRef={{ current: centreStub }}
      />
    </div>
  );
}
