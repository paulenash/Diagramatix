"use client";

interface Props {
  diagramId: string;
  diagramName: string;
  bundleId: string | null;
  // Element currently attached (picked on the canvas), if any.
  attachedElement: { id: string; label: string } | null;
  // Local form state is lifted to the parent so it survives the
  // dialog being hidden during "pick element" mode.
  body: string;
  onBodyChange: (v: string) => void;
  submitting: boolean;
  error: string | null;
  // Enter pick mode — parent hides the dialog and arms the canvas overlay.
  onStartPick: () => void;
  onClearAttached: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

// FeedbackDialog — business-user (or owner-preview) feedback on a
// published process. Free-text message plus an optional element pin
// captured by clicking the canvas. Submits to the diagram's feedback
// endpoint; the diagram owner gets a notification + sees it in their
// editor FeedbackPanel.
export function FeedbackDialog({
  diagramName,
  attachedElement,
  body,
  onBodyChange,
  submitting,
  error,
  onStartPick,
  onClearAttached,
  onSubmit,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Send feedback</h3>
          <p className="text-xs text-gray-700 mt-1">
            Your feedback on <strong>{diagramName}</strong> goes to the diagram owner. You can optionally
            pin it to a specific element.
          </p>
        </div>

        <div className="px-5 py-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={5}
              autoFocus
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-y"
              placeholder="What would you like the owner to know?"
            />
          </div>

          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Attached element (optional)</div>
            {attachedElement ? (
              <div className="flex items-center gap-2 text-xs border border-gray-200 rounded px-2 py-1.5 bg-blue-50/40">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium shrink-0">
                  PINNED
                </span>
                <span className="flex-1 truncate text-gray-800">
                  {attachedElement.label || "(unnamed element)"}
                </span>
                <button
                  onClick={onClearAttached}
                  className="text-gray-600 hover:text-red-600 text-sm"
                  title="Remove attachment"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={onStartPick}
                className="text-xs text-blue-700 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50"
              >
                Pick element on canvas…
              </button>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1">
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
            onClick={onSubmit}
            disabled={submitting || !body.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
          >
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
