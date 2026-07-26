"use client";

import { useCallback, useEffect, useState } from "react";

export interface AllowedModel { id: string; label: string; costUsd: number | null; }

/**
 * Fetch the generate models the current user may choose (cost-gated for normal
 * users; all for a SuperAdmin in SuperAdmin mode — pass `saMode`). Always includes
 * the current default, so callers can safely default their model state to
 * `current?.id`. See `GET /api/ai/models` + `app/lib/ai/modelAccess.ts`.
 */
export function useAllowedModels(saMode: boolean) {
  const [models, setModels] = useState<AllowedModel[]>([]);
  const [current, setCurrent] = useState<{ id: string; label: string } | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/models${saMode ? "?saMode=1" : ""}`);
      if (res.ok) {
        const j = await res.json();
        setModels(Array.isArray(j.models) ? j.models : []);
        setCurrent(j.current ?? null);
      }
    } catch { /* leave empty; callers fall back to the server default */ }
  }, [saMode]);
  useEffect(() => { reload(); }, [reload]);
  return { models, current, reload };
}

/** A compact model `<select>` showing each model's label + rough per-generation cost. */
export function ModelSelect({
  value, onChange, models, disabled, className,
}: {
  value: string;
  onChange: (id: string) => void;
  models: AllowedModel[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className ?? "text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"}
    >
      {/* Ensure the current value is always selectable even before the list loads. */}
      {models.length === 0 && value ? <option value={value}>{value}</option> : null}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}{m.costUsd != null ? ` (~$${m.costUsd.toFixed(3)})` : ""}
        </option>
      ))}
    </select>
  );
}
