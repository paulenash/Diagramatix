"use client";

import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import type { FolderSummary } from "@/app/lib/projects/folderSummary";

/**
 * Folder Properties — shown when a folder is clicked in the project's navigation tree: where it sits and a summary of what it holds
 * (Paul, 2026-10-06). Read-only: renaming, adding, moving and deleting are on the folder's right-click menu.
 */
export function FolderPropertiesPanel({
  name, summary, onCollapse, onOpenDiagram,
}: {
  name: string;
  summary: FolderSummary;
  onCollapse?: () => void;
  /** Select a diagram from the "recently changed" list. */
  onOpenDiagram?: (id: string) => void;
}) {
  const row = "flex items-baseline justify-between gap-3 text-xs py-0.5";
  const label = "text-gray-500";
  const value = "text-gray-800 font-medium tabular-nums";
  return (
    <aside data-testid="folder-properties" className="w-72 shrink-0 border-l border-gray-200 bg-white p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Folder Properties</span>
        {onCollapse && (
          <button onClick={onCollapse} title="Collapse panel" aria-label="Hide properties"
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs rounded hover:bg-gray-100">{"▶"}</button>
        )}
      </div>

      <h2 className="text-sm font-semibold text-gray-900 break-words">{name}</h2>
      {summary.path.length > 1 && <p className="text-[11px] text-gray-400 mt-0.5 break-words">{summary.path.join(" › ")}</p>}

      <div className="mt-3 border-t border-gray-100 pt-2" data-testid="folder-summary">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Contents</p>
        {summary.empty ? (
          <p className="text-xs text-gray-400 italic">This folder is empty.</p>
        ) : (
          <>
            <div className={row}><span className={label}>Diagrams in this folder</span><span className={value}>{summary.direct.diagrams}</span></div>
            <div className={row}><span className={label}>Subfolders in this folder</span><span className={value}>{summary.direct.folders}</span></div>
            {(summary.total.folders > summary.direct.folders || summary.total.diagrams > summary.direct.diagrams) && (
              <>
                <div className={row}><span className={label}>Diagrams including subfolders</span><span className={value}>{summary.total.diagrams}</span></div>
                <div className={row}><span className={label}>Subfolders at all levels</span><span className={value}>{summary.total.folders}</span></div>
              </>
            )}
            {summary.lastChanged && (
              <div className={row}><span className={label}>Last changed</span><span className={value}>{new Date(summary.lastChanged).toLocaleDateString()}</span></div>
            )}
          </>
        )}
      </div>

      {summary.byType.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2" data-testid="folder-by-type">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">By diagram type</p>
          {summary.byType.map((t) => (
            <div key={t.type} className="flex items-center justify-between gap-2 text-xs py-0.5">
              <span className="flex items-center gap-1.5 min-w-0"><DiagramTypeBadge type={t.type} showLabel showCode={false} /></span>
              <span className={value}>{t.count}</span>
            </div>
          ))}
        </div>
      )}

      {summary.recent.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2" data-testid="folder-recent">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Recently changed</p>
          {summary.recent.map((d) => (
            <button key={d.id} onClick={() => onOpenDiagram?.(d.id)} title={d.name}
              className="flex items-center justify-between gap-2 w-full text-left text-xs py-0.5 rounded hover:bg-gray-50">
              <span className="truncate text-gray-700">{d.name}</span>
              <span className="shrink-0 text-[10px] text-gray-400">{new Date(d.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
