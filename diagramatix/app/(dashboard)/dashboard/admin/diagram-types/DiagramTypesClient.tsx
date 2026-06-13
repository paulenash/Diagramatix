"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_DIAGRAM_TYPE_STYLES,
  isHexColor,
  type DiagramTypeStyle,
} from "@/app/lib/diagram/diagramTypeStyles";
import { invalidateDiagramTypeStyleCache } from "@/app/hooks/useDiagramTypeStyles";

export function DiagramTypesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  // Reject protocol-relative URLs (audit SEC-15) — startsWith("/") alone
  // would accept "//evil.com".
  const backHref =
    rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/dashboard/admin";

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

  const isDirty = (() => {
    if (!styles || !savedSnapshot) return false;
    return JSON.stringify(styles) !== JSON.stringify(savedSnapshot);
  })();

  function update(typeKey: string, patch: Partial<DiagramTypeStyle>) {
    setStyles((prev) => (prev ? prev.map((s) => (s.typeKey === typeKey ? { ...s, ...patch } : s)) : prev));
  }

  function resetToDefaults() {
    setStyles(DEFAULT_DIAGRAM_TYPE_STYLES.map((s) => ({ ...s })));
  }

  async function save() {
    if (!styles) return;
    // Client-side validation mirrors the API.
    for (const s of styles) {
      const code = s.code.trim();
      if (code.length < 1 || code.length > 3) {
        setError(`Code for ${s.label} must be 1–3 characters`);
        return;
      }
      if (!isHexColor(s.bgColor) || !isHexColor(s.textColor)) {
        setError(`Colours for ${s.label} must be valid #rrggbb hex`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/diagram-type-styles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styles: styles.map((s) => ({
            typeKey: s.typeKey,
            code: s.code.trim().toUpperCase(),
            bgColor: s.bgColor,
            textColor: s.textColor,
          })),
        }),
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
            title={`Return to ${backHref}`}
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">SuperAdmin</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">Diagram Types</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="text-xs text-gray-600 border border-gray-300 hover:bg-gray-50 rounded px-3 py-1"
            title="Reset all codes and colours to the built-in defaults (not saved until you click Save)"
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

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500 mb-4">
            The 2-character code and pastel colours shown for each diagram type — in the project
            navigation tree, the editor top bar, and the type chips across the app. Keep codes to 1–3
            characters. Avoid purple and yellow: those are reserved for the sharing / publish colour codes.
          </p>

          {error && <p className="text-xs text-red-700 mb-3">{error}</p>}

          {styles === null ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="hidden sm:grid grid-cols-[1.4fr_0.7fr_1.3fr_1.3fr_0.9fr] gap-3 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-medium">
                <span>Diagram type</span>
                <span>Code</span>
                <span>Background</span>
                <span>Text colour</span>
                <span>Preview</span>
              </div>
              {styles.map((s) => (
                <div
                  key={s.typeKey}
                  className="grid grid-cols-2 sm:grid-cols-[1.4fr_0.7fr_1.3fr_1.3fr_0.9fr] gap-3 items-center border border-gray-200 rounded bg-gray-50 px-2 py-2"
                >
                  <span className="text-sm text-gray-800 font-medium">{s.label}</span>

                  <input
                    type="text"
                    maxLength={3}
                    value={s.code}
                    onChange={(e) => update(s.typeKey, { code: e.target.value.toUpperCase() })}
                    className="w-14 text-xs font-bold text-center border border-gray-300 rounded px-1 py-1 uppercase"
                  />

                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={isHexColor(s.bgColor) ? s.bgColor : "#ffffff"}
                      onChange={(e) => update(s.typeKey, { bgColor: e.target.value })}
                      className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={s.bgColor}
                      onChange={(e) => update(s.typeKey, { bgColor: e.target.value })}
                      className="w-20 text-[11px] font-mono border border-gray-300 rounded px-1 py-1"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={isHexColor(s.textColor) ? s.textColor : "#000000"}
                      onChange={(e) => update(s.typeKey, { textColor: e.target.value })}
                      className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={s.textColor}
                      onChange={(e) => update(s.typeKey, { textColor: e.target.value })}
                      className="w-20 text-[11px] font-mono border border-gray-300 rounded px-1 py-1"
                    />
                  </div>

                  <span
                    className="inline-flex items-center gap-1 justify-self-start rounded px-1.5 py-0.5"
                    style={{ backgroundColor: isHexColor(s.bgColor) ? s.bgColor : "#fff", color: isHexColor(s.textColor) ? s.textColor : "#000" }}
                  >
                    <span className="text-[10px] font-bold">{s.code || "??"}</span>
                    <span className="text-[10px] font-medium">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
