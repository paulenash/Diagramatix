"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface ArchivedDiagram {
  id: string;
  name: string;
  type: string;
  archivedAt: string;
  originalUserEmail: string;
  originalProjectName: string | null;
  originalProjectId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  context: "Context",
  basic: "Context",
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
  domain: "Domain",
};

export function ArchiveClient() {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState<ArchivedDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/archive")
      .then((r) => r.ok ? r.json() : [])
      .then((data: ArchivedDiagram[]) => setDiagrams(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleRestore(diagramId: string) {
    const diag = diagrams.find(d => d.id === diagramId);
    setConfirmDialog({
      title: "Restore Diagram",
      message: `Restore "${diag?.name ?? "this diagram"}" to ${diag?.originalUserEmail ?? "the original user"}?${
        diag?.originalProjectName ? ` It will be placed back in "${diag.originalProjectName}" if the project still exists, otherwise it will appear in Unorganised.` : " It will appear in the user's Unorganised diagrams."
      }`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch("/api/admin/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diagramId }),
        });
        if (res.ok) {
          setDiagrams((prev) => prev.filter((d) => d.id !== diagramId));
        }
      },
    });
  }

  function handlePermanentDelete(diagramId: string) {
    const diag = diagrams.find(d => d.id === diagramId);
    setConfirmDialog({
      title: "Permanently Delete",
      message: `Permanently delete "${diag?.name ?? "this diagram"}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await fetch(`/api/diagrams/${diagramId}`, { method: "DELETE" });
        setDiagrams((prev) => prev.filter((d) => d.id !== diagramId));
      },
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/admin")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {"\u2190"} Admin
          </button>
          <h1 className="font-semibold text-gray-900">System Archive</h1>
          <span className="text-xs text-gray-400">{diagrams.length} diagram(s)</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : diagrams.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-sm">No archived diagrams</p>
          </div>
        ) : (
          <table className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Diagram</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Original Owner</th>
                <th className="px-4 py-3">Original Project</th>
                <th className="px-4 py-3">Deleted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diagrams.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                      {TYPE_LABELS[d.type] ?? d.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.originalUserEmail}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {d.originalProjectName ?? <span className="text-gray-400 italic">Unorganised</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(d.archivedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleRestore(d.id)}
                      className="text-xs text-green-600 hover:text-green-800 font-medium border border-green-300 rounded px-2 py-1 hover:bg-green-50"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(d.id)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.title.includes("Permanently") ? "Delete Forever" : "Restore"}
          destructive={confirmDialog.title.includes("Permanently")}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
