"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dashboard "Send for Review" surface (Phase 2). Two collections —
 * Received (diagrams you must review) and Sent (diagrams you sent out) —
 * fetched from GET /api/reviews. Tiles are colour-coded by due-date
 * proximity; Sent tiles expose per-reviewer statuses. Renders nothing
 * when the user has no reviews either way.
 */

interface ReviewerStatusEntry {
  userId: string;
  name: string | null;
  email: string;
  status: string;
}

interface ReviewTile {
  diagramId: string;
  diagramName: string;
  diagramType: string;
  reviewContext: {
    role: "received" | "sent";
    reviewId: string;
    groupName: string;
    objective: string;
    dueDate: string;
    status: string;
    requesterName: string;
    requesterEmail: string;
    reviewerStatuses?: ReviewerStatusEntry[];
    myStatus?: string;
  };
}

// Pure UI helpers (kept client-safe — the server copies live in
// app/lib/reviewProjects.ts which imports prisma).
const REVIEWER_STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  "in-progress": "bg-blue-100 text-blue-700",
  submitted: "bg-green-100 text-green-700",
  approved: "bg-yellow-100 text-yellow-800",
  "declined-to-review": "bg-red-100 text-red-700",
};

function dueDateBorderClass(dueISO: string): string {
  const days = (new Date(dueISO).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "border-l-red-500";
  if (days <= 2) return "border-l-orange-400";
  return "border-l-green-400";
}

function dueLabel(dueISO: string): string {
  const days = Math.ceil((new Date(dueISO).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

function statusPill(status: string) {
  const cls = REVIEWER_STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 ${cls}`}>
      {status.replace(/-/g, " ")}
    </span>
  );
}

const ACTIONABLE = new Set(["pending", "in-progress"]);

function ReviewTileCard({ tile, onAction, onResubmit }: {
  tile: ReviewTile;
  onAction: (reviewId: string, action: "submit" | "decline") => void;
  onResubmit: (reviewId: string) => void;
}) {
  const router = useRouter();
  const [showReviewers, setShowReviewers] = useState(false);
  const c = tile.reviewContext;
  // Received tiles open in Review Mode (?review=) so the reviewer gets the
  // banner + the review-comment tool; sent tiles open the diagram normally.
  const href = c.role === "received"
    ? `/diagram/${tile.diagramId}?review=${c.reviewId}`
    : `/diagram/${tile.diagramId}`;
  return (
    <div
      onClick={() => router.push(href)}
      className={`bg-white border border-gray-200 border-l-4 ${dueDateBorderClass(c.dueDate)} rounded px-3 py-2 hover:shadow-sm cursor-pointer transition-all`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-gray-900 text-xs truncate flex-1">{tile.diagramName}</h3>
        <span className="text-[9px] text-gray-400 shrink-0">{dueLabel(c.dueDate)}</span>
      </div>
      <p className="text-[10px] text-gray-600 truncate mt-0.5" title={c.objective}>{c.objective}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[9px] text-gray-400">
        <span className="bg-purple-50 text-purple-700 rounded px-1 py-0.5">{c.groupName}</span>
        {c.role === "received"
          ? <span>from {c.requesterName}</span>
          : <span>{c.reviewerStatuses?.length ?? 0} reviewer{(c.reviewerStatuses?.length ?? 0) === 1 ? "" : "s"}</span>}
        {c.role === "received" && c.myStatus && <span className="ml-auto">{statusPill(c.myStatus)}</span>}
      </div>
      {c.role === "received" && ACTIONABLE.has(c.myStatus ?? "pending") && (
        <div className="flex gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onAction(c.reviewId, "submit")}
            className="text-[9px] text-white bg-green-600 hover:bg-green-700 rounded px-2 py-0.5"
          >
            Mark reviewed
          </button>
          <button
            onClick={() => onAction(c.reviewId, "decline")}
            className="text-[9px] text-gray-700 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50"
          >
            Decline
          </button>
        </div>
      )}
      {c.role === "sent" && (c.reviewerStatuses?.length ?? 0) > 0 && (
        <div className="mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowReviewers((v) => !v); }}
            className="text-[9px] text-blue-600 hover:underline"
          >
            {showReviewers ? "Hide reviewers" : "Show reviewers"}
          </button>
          {showReviewers && (
            <ul className="mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
              {c.reviewerStatuses!.map((r) => (
                <li key={r.userId} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-700 truncate flex-1">{r.name ?? r.email}</span>
                  {statusPill(r.status)}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onResubmit(c.reviewId); }}
            className="mt-1 text-[9px] text-pink-700 border border-pink-300 rounded px-2 py-0.5 hover:bg-pink-50"
            title="Reset all reviewers to pending and notify them for a fresh approval round"
          >
            Re-submit for final approval
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewsSection() {
  const [received, setReceived] = useState<ReviewTile[]>([]);
  const [sent, setSent] = useState<ReviewTile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews");
      if (!res.ok) return;
      const data = await res.json();
      setReceived(Array.isArray(data.received) ? data.received : []);
      setSent(Array.isArray(data.sent) ? data.sent : []);
    } catch { /* offline — silent */ } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = useCallback(async (reviewId: string, action: "submit" | "decline") => {
    // Optimistic: reflect the new status immediately.
    const newStatus = action === "submit" ? "submitted" : "declined-to-review";
    setReceived((prev) => prev.map((t) =>
      t.reviewContext.reviewId === reviewId
        ? { ...t, reviewContext: { ...t.reviewContext, myStatus: newStatus } }
        : t,
    ));
    try {
      const res = await fetch(`/api/reviews/${reviewId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) await load();   // reconcile on failure
    } catch { await load(); }
  }, [load]);

  const handleResubmit = useCallback(async (reviewId: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/resubmit`, { method: "POST" });
      if (res.ok) await load();   // refresh statuses (reviewers reset to pending)
    } catch { /* ignore */ }
  }, [load]);

  // Nothing to show — stay out of the way entirely.
  if (!loaded || (received.length === 0 && sent.length === 0)) return null;

  return (
    <>
      {received.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Diagrams Received for Review <span className="text-gray-400 font-normal">({received.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {received.map((t) => <ReviewTileCard key={t.reviewContext.reviewId} tile={t} onAction={handleAction} onResubmit={handleResubmit} />)}
          </div>
        </section>
      )}
      {sent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Diagrams Sent for Review <span className="text-gray-400 font-normal">({sent.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sent.map((t) => <ReviewTileCard key={t.reviewContext.reviewId} tile={t} onAction={handleAction} onResubmit={handleResubmit} />)}
          </div>
        </section>
      )}
    </>
  );
}
