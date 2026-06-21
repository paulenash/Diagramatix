"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_DIAGRAM_TYPE_STYLES,
  isHexColor,
  type DiagramTypeStyle,
} from "@/app/lib/diagram/diagramTypeStyles";
import { invalidateDiagramTypeStyleCache } from "@/app/hooks/useDiagramTypeStyles";

export function DiagramTypeSortOrderClient({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const defaultBack = isSuperAdmin ? "/dashboard/admin" : "/dashboard/org-admin";
  // Reject protocol-relative URLs ("//evil.com") — startsWith("/") alone isn't enough.
  const backHref =
    rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : defaultBack;
  const backLabel = isSuperAdmin ? "SuperAdmin" : "OrgAdmin";

  const [styles, setStyles] = useState<DiagramTypeStyle[] | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<DiagramTypeStyle[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/diagram-type-styles")
      .then((r) => (r.ok ? r.json() : { styles: DEFAULT_DIAGRAM_TYPE_STYLES }))
      .then((data: { styles?: DiagramTypeStyle[] }) => {
        const list = Array.isArray(data.styles) && data.styles.length ? data.styles : DEFAULT_DIAGRAM_TYPE_STYLES;
        setStyles(list);
        setSavedSnapshot(list);
      })
      .catch(() => {
        setStyles(DEFAULT_DIAGRAM_TYPE_STYLES);
        setSavedSnapshot(DEFAULT_DIAGRAM_TYPE_STYLES);
      });
  }, []);

  // Dirty = order changed (only sortOrder matters here).
  const isDirty = (() => {
    if (!styles || !savedSnapshot) return false;
    return styles.map((s) => s.typeKey).join(",") !== savedSnapshot.map((s) => s.typeKey).join(",");
  })();

  function move(index: number, dir: -1 | 1) {
    setStyles((prev) => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function resetToDefaults() {
    setStyles(DEFAULT_DIAGRAM_TYPE_STYLES.map((s) => ({ ...s })));
  }

  async function save() {
    if (!styles) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/diagram-type-styles/sort-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: styles.map((s) => s.typeKey) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const json = await res.json();
      const persisted = (json.styles ?? []) as DiagramTypeStyle[];
      setStyles(persisted);
      setSavedSnapshot(persisted);
      invalidateDiagramTypeStyleCache();
      setStatus("Saved");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (savedSnapshot) setStyles(savedSnapshot.map((s) => ({ ...s })));
    setError(null);
    setStatus(null);
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
            title={`Return to ${backHref}`}
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">{backLabel}</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">Diagram Type Sort Order</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="text-xs text-gray-600 border border-gray-300 hover:bg-gray-50 rounded px-3 py-1"
            title="Reset to the built-in default order (not saved until you click Save)"
          >
            Reset to defaults
          </button>
          <button
            onClick={cancel}
            disabled={saving || !isDirty}
            className="text-xs text-gray-700 border border-gray-300 hover:bg-gray-50 rounded px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {status && <span className="text-xs text-green-600">{status}</span>}
        </div>
      </header>

      <main className="max-w-xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500 mb-4">
            The order diagram types are listed across the app — including the project page&apos;s
            <span className="font-medium"> Diagram Type</span> sort. Move a type up or down to change
            its position. This order is shared platform-wide.
          </p>

          {error && <p className="text-xs text-red-700 mb-3">{error}</p>}

          {styles === null ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : (
            <ol className="space-y-2">
              {styles.map((s, i) => (
                <li
                  key={s.typeKey}
                  className="flex items-center gap-3 border border-gray-200 rounded bg-gray-50 px-3 py-2"
                >
                  <span className="text-xs text-gray-400 w-5 tabular-nums text-right">{i + 1}</span>
                  {/* Code + name chip in the type's configured colours */}
                  <span
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 flex-1"
                    style={{
                      backgroundColor: isHexColor(s.bgColor) ? s.bgColor : "#fff",
                      color: isHexColor(s.textColor) ? s.textColor : "#000",
                    }}
                  >
                    <span className="text-[11px] font-bold">{s.code || "??"}</span>
                    <span className="text-xs font-medium">{s.label}</span>
                  </span>
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-gray-500 hover:text-blue-600 disabled:opacity-25 disabled:cursor-not-allowed leading-none text-xs px-1"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === styles.length - 1}
                      className="text-gray-500 hover:text-blue-600 disabled:opacity-25 disabled:cursor-not-allowed leading-none text-xs px-1"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}
