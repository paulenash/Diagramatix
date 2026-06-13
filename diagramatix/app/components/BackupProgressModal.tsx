"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live backup progress + report. Opens, streams NDJSON progress from a
 * `?stream=1` backup endpoint (see app/lib/backupStream.ts), shows each
 * section as it's backed up, then renders a statistical report and triggers
 * the file download. Self-contained — give it the stream URL + a title.
 */

interface ProgressItem {
  label: string;
  count: number;
}
interface DoneInfo {
  filename: string;
  counts: Record<string, number>;
  bytes: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function triggerDownload(b64: string, filename: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BackupProgressModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [phase, setPhase] = useState<"running" | "compressing" | "done" | "error">("running");
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // guard React StrictMode double-invoke
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`Backup failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done: rdone, value } = await reader.read();
          if (rdone) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const lineStr = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!lineStr) continue;
            const msg = JSON.parse(lineStr) as
              | { t: "progress"; label: string; count: number }
              | { t: "done"; filename: string; counts: Record<string, number>; bytes: number; data: string }
              | { t: "error"; message: string };
            if (msg.t === "progress") {
              if (msg.label === "Compressing") setPhase("compressing");
              else setItems((prev) => [...prev, { label: msg.label, count: msg.count }]);
            } else if (msg.t === "done") {
              triggerDownload(msg.data, msg.filename);
              setDone({ filename: msg.filename, counts: msg.counts, bytes: msg.bytes });
              setPhase("done");
            } else if (msg.t === "error") {
              setError(msg.message);
              setPhase("error");
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Backup failed");
        setPhase("error");
      }
    })();
  }, [url]);

  const totalRows = done
    ? Object.values(done.counts).reduce((a, b) => a + b, 0)
    : items.reduce((a, b) => a + b.count, 0);
  const nonEmpty = done ? Object.entries(done.counts).filter(([, c]) => c > 0) : [];

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            {phase === "done" ? "✔ Backup complete" : phase === "error" ? "✘ Backup failed" : title}
          </h2>
          {(phase === "done" || phase === "error") && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
              &times;
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {phase !== "done" && phase !== "error" && (
            <div className="space-y-0.5 text-xs font-mono">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-gray-700">
                  <span>
                    <span className="text-green-600">{"✔"}</span> {it.label}
                  </span>
                  <span className={it.count === 0 ? "text-gray-300" : "text-gray-500"}>{it.count}</span>
                </div>
              ))}
              <div className="text-blue-500 animate-pulse pt-1">
                {"●"} {phase === "compressing" ? "Compressing…" : "Backing up…"}
              </div>
            </div>
          )}

          {phase === "done" && done && (
            <div className="text-xs">
              <p className="text-gray-600 mb-2">
                Saved as <span className="font-mono text-gray-800 break-all">{done.filename}</span>
              </p>
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {nonEmpty.map(([label, count]) => (
                      <tr key={label} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1 text-gray-700">{label}</td>
                        <td className="px-3 py-1 text-right text-gray-500 font-mono">{count}</td>
                      </tr>
                    ))}
                    {nonEmpty.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-gray-400 italic" colSpan={2}>
                          Nothing to back up yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-3 py-1.5 text-gray-800">{totalRows} rows total</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 font-mono">{formatBytes(done.bytes)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">The file has been downloaded to your browser.</p>
            </div>
          )}

          {phase === "error" && (
            <p className="text-xs text-red-700">{error}</p>
          )}
        </div>

        {(phase === "done" || phase === "error") && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
