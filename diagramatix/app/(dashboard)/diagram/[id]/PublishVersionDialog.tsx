"use client";

import { useEffect, useState } from "react";

interface Props {
  diagramId: string;
  nextVersionNumber: number;
  // Pre-fill from the diagram's current values so re-publishing carries
  // forward the previous cadence / next review date.
  initialReviewCadenceMonths: number | null;
  initialNextReviewDate: string | null; // ISO yyyy-mm-dd
  onClose: () => void;
  onPublished: (payload: { versionId: string; versionNumber: number; publishedAt: string }) => void;
}

// Modal for "Publish version…". Collects release notes + a "next review"
// signal (either an absolute date OR a cadence in months), then calls
// POST /api/diagrams/[id]/publish. Closes on success.
//
// The cadence-vs-date trade-off is presented as two ways to set the same
// underlying nextReviewDate. If the owner picks a cadence the date input
// is derived from today + cadence and shown read-only; switching to
// "Specific date" lets them override.
export function PublishVersionDialog({
  diagramId,
  nextVersionNumber,
  initialReviewCadenceMonths,
  initialNextReviewDate,
  onClose,
  onPublished,
}: Props) {
  const [releaseNotes, setReleaseNotes] = useState("");
  const [mode, setMode] = useState<"cadence" | "date" | "none">(
    initialReviewCadenceMonths != null ? "cadence"
      : initialNextReviewDate ? "date"
      : "cadence",
  );
  const [cadenceMonths, setCadenceMonths] = useState<number>(initialReviewCadenceMonths ?? 12);
  const [reviewDate, setReviewDate] = useState<string>(initialNextReviewDate ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived date when cadence is the input mode. Recomputed on every
  // cadence change so the displayed "next review" date matches what the
  // server will see.
  useEffect(() => {
    if (mode !== "cadence") return;
    const d = new Date();
    d.setMonth(d.getMonth() + cadenceMonths);
    setReviewDate(d.toISOString().slice(0, 10));
  }, [mode, cadenceMonths]);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        releaseNotes: releaseNotes.trim() || undefined,
      };
      if (mode === "cadence") {
        body.reviewCadenceMonths = cadenceMonths;
        body.nextReviewDate = reviewDate || null;
      } else if (mode === "date") {
        body.nextReviewDate = reviewDate || null;
        body.reviewCadenceMonths = null;
      } else {
        body.nextReviewDate = null;
        body.reviewCadenceMonths = null;
      }
      const res = await fetch(`/api/diagrams/${diagramId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Publish failed (${res.status})`);
        return;
      }
      const { version } = await res.json();
      onPublished({
        versionId: version.id,
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Publish version {nextVersionNumber}
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed mb-4">
            Publishes a frozen snapshot of the current diagram as v{nextVersionNumber}. You keep editing the live draft;
            anyone with access sees this snapshot until you publish again.
          </p>

          <label className="block text-xs font-medium text-gray-700 mb-1">
            Release notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-3 resize-y"
            placeholder="What changed in this version?"
          />

          <div className="text-xs font-medium text-gray-700 mb-1">Next review</div>
          <div className="flex items-center gap-3 text-xs mb-2">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "cadence"}
                onChange={() => setMode("cadence")}
              />
              <span>Cadence</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "date"}
                onChange={() => setMode("date")}
              />
              <span>Specific date</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "none"}
                onChange={() => setMode("none")}
              />
              <span>None</span>
            </label>
          </div>
          {mode === "cadence" && (
            <div className="flex items-center gap-2 text-xs mb-3">
              <span className="text-gray-600">Review again every</span>
              <input
                type="number"
                min={1}
                max={120}
                value={cadenceMonths}
                onChange={(e) => setCadenceMonths(Math.max(1, Math.min(120, Number.parseInt(e.target.value, 10) || 1)))}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
              />
              <span className="text-gray-600">months</span>
              <span className="text-gray-400">→ next review {reviewDate}</span>
            </div>
          )}
          {mode === "date" && (
            <div className="flex items-center gap-2 text-xs mb-3">
              <span className="text-gray-600">Next review on</span>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs"
              />
            </div>
          )}
          {mode === "none" && (
            <div className="text-xs text-gray-500 mb-3">
              No review date set. The diagram won&apos;t appear on a due-for-review list.
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1 mb-3">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {submitting ? "Publishing…" : `Publish v${nextVersionNumber}`}
          </button>
        </div>
      </div>
    </div>
  );
}
