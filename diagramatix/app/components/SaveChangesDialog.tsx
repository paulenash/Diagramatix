"use client";

interface Props {
  title?: string;
  message: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Three-action "unsaved changes" dialog (Diagramatix-native — NEVER
 * window.confirm). Save / Don't Save / Cancel, modelled on ConfirmDialog.
 * Used by the AI panels' "New" button before clearing the current prompt.
 */
export function SaveChangesDialog({
  title = "Save changes?",
  message,
  saveLabel = "Save",
  discardLabel = "Don't save",
  cancelLabel = "Cancel",
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            {discardLabel}
          </button>
          <button
            onClick={onSave}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
