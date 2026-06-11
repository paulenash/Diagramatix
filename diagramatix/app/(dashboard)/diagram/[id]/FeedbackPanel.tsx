"use client";

import { useCallback, useEffect, useState } from "react";

interface FeedbackItem {
  id: string;
  body: string;
  attachedElementId: string | null;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  author: { id: string; name: string | null; email: string };
  versionNumber: number;
  bundle: { id: string; name: string } | null;
}

interface Props {
  diagramId: string;
  // Focus an element on the canvas (used when a feedback item is pinned).
  onFocusElement?: (elementId: string) => void;
  onClose: () => void;
}

const STATUS_STYLE: Record<FeedbackItem["status"], string> = {
  OPEN: "bg-orange-100 text-orange-800",
  ACKNOWLEDGED: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-gray-100 text-gray-600",
};

const STATUS_ORDER: FeedbackItem["status"][] = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"];

// Owner-facing panel listing business-user feedback on this diagram,
// grouped by status. Each item can be moved through the lifecycle
// (Acknowledge / Resolve / Dismiss / Reopen). Pinned items expose a
// "Find on canvas" action.
export function FeedbackPanel({ diagramId, onFocusElement, onClose }: Props) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/diagrams/${diagramId}/feedback`);
    if (res.ok) {
      const j = await res.json();
      setItems(j.feedback ?? []);
    } else {
      setItems([]);
    }
  }, [diagramId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function setStatus(fid: string, status: FeedbackItem["status"]) {
    setBusyId(fid);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/feedback/${fid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const grouped = STATUS_ORDER.map(s => ({
    status: s,
    rows: (items ?? []).filter(i => i.status === s),
  })).filter(g => g.rows.length > 0);

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-lg z-40 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Feedback</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {items === null && <div className="text-xs text-gray-500">Loading…</div>}
        {items !== null && items.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-6">
            No feedback yet. Business users can send feedback from the published process view.
          </div>
        )}
        {grouped.map(group => (
          <div key={group.status}>
            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1.5">
              {group.status.toLowerCase()} ({group.rows.length})
            </div>
            <div className="space-y-2">
              {group.rows.map(item => (
                <div key={item.id} className="border border-gray-200 rounded p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 ${STATUS_STYLE[item.status]}`}>
                      {item.status.toLowerCase()}
                    </span>
                    <span className="text-[10px] text-gray-400">v{item.versionNumber}</span>
                  </div>
                  <p className="text-xs text-gray-800 whitespace-pre-wrap mb-1.5">{item.body}</p>
                  <div className="text-[10px] text-gray-500 mb-2">
                    {item.author.name ?? item.author.email}
                    {" · "}{new Date(item.createdAt).toLocaleDateString()}
                    {item.bundle && <> · via {item.bundle.name}</>}
                  </div>
                  {item.attachedElementId && onFocusElement && (
                    <button
                      onClick={() => onFocusElement(item.attachedElementId!)}
                      className="text-[11px] text-blue-700 hover:underline mb-2 block"
                    >
                      Find pinned element on canvas
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {item.status !== "ACKNOWLEDGED" && item.status !== "RESOLVED" && item.status !== "DISMISSED" && (
                      <button
                        onClick={() => setStatus(item.id, "ACKNOWLEDGED")}
                        disabled={busyId === item.id}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                    {item.status !== "RESOLVED" && (
                      <button
                        onClick={() => setStatus(item.id, "RESOLVED")}
                        disabled={busyId === item.id}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    )}
                    {item.status !== "DISMISSED" && (
                      <button
                        onClick={() => setStatus(item.id, "DISMISSED")}
                        disabled={busyId === item.id}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    )}
                    {(item.status === "RESOLVED" || item.status === "DISMISSED") && (
                      <button
                        onClick={() => setStatus(item.id, "OPEN")}
                        disabled={busyId === item.id}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
