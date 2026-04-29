"use client";

interface Props {
  title: string;
  lines: string[];
  okLabel?: string;
  onClose: () => void;
}

export function InfoDialog({ title, lines, okLabel = "OK", onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
          <div className="text-xs text-gray-600 leading-relaxed space-y-1">
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
