"use client";

/**
 * Choose skills from the org's master list.
 *
 * Used in two places that must agree: the people on a team (what somebody CAN
 * do) and a task (what the work REQUIRES). They are two halves of one match, so
 * they draw from one list and one component — a picker per screen is how the
 * two vocabularies drift apart again.
 *
 * **A skill already on the record is always shown, even if the catalog no longer
 * offers it.** Models predate the catalog, and a retired skill still resolves;
 * dropping one from the display would quietly suggest a constraint had gone when
 * the engine still enforces it. Those appear marked rather than hidden.
 *
 * The catalog is fetched once per org and cached at module scope: this renders
 * once per task row and once per person, and a request each would be dozens.
 */
import { useEffect, useState } from "react";

export interface CatalogSkill { id: string; name: string; category: string | null; description: string | null }

const cache = new Map<string, CatalogSkill[]>();
const inflight = new Map<string, Promise<CatalogSkill[]>>();

/** The org's active skills. Never throws: a picker that cannot load its list
 *  still has to show what the record already holds. */
export function loadSkills(orgId?: string): Promise<CatalogSkill[]> {
  const key = orgId ?? "";
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/skills${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j) => { const list = (j.skills ?? []) as CatalogSkill[]; cache.set(key, list); return list; })
      .catch(() => { cache.set(key, []); return []; });
    inflight.set(key, p);
  }
  return p;
}

/** Drop the cache after the catalog is edited, so pickers pick up new entries. */
export function invalidateSkillCache() { cache.clear(); inflight.clear(); }

export function useSkillCatalog(orgId?: string): CatalogSkill[] {
  const [list, setList] = useState<CatalogSkill[]>(cache.get(orgId ?? "") ?? []);
  useEffect(() => {
    let on = true;
    void loadSkills(orgId).then((l) => { if (on) setList(l); });
    return () => { on = false; };
  }, [orgId]);
  return list;
}

export function SkillPicker({
  value, onChange, orgId, disabled, placeholder = "+ skill", dark = false, emptyHint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  orgId?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Matrix-themed surfaces (the Simulator console) vs the light admin screens. */
  dark?: boolean;
  /** Shown when the catalog is empty — otherwise the control looks broken. */
  emptyHint?: string;
}) {
  const catalog = useSkillCatalog(orgId);
  const known = new Set(catalog.map((s) => s.name));
  const chosen = value ?? [];
  const available = catalog.filter((s) => !chosen.includes(s.name));

  const chip = dark
    ? "border-green-500/40 text-green-200 bg-green-400/5"
    : "border-gray-300 text-gray-700 bg-gray-50";
  const chipUnknown = dark
    ? "border-amber-400/50 text-amber-300 bg-amber-400/5"
    : "border-amber-300 text-amber-800 bg-amber-50";
  const sel = dark
    ? "bg-black border border-green-500/40 text-green-200 rounded px-1 py-0.5 text-[10px] [color-scheme:dark]"
    : "border border-gray-300 rounded px-1.5 py-0.5 text-[11px] bg-white";

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {chosen.map((name) => {
        const unknown = !known.has(name);
        return (
          <span key={name}
            title={unknown
              ? `"${name}" is not in the Skills list — it still works, but it cannot be picked elsewhere until it is added`
              : catalog.find((s) => s.name === name)?.description ?? name}
            className={`inline-flex items-center gap-1 border rounded-full px-1.5 text-[10px] leading-4 ${unknown ? chipUnknown : chip}`}>
            {unknown && <span aria-hidden>⚠</span>}
            {name}
            {!disabled && (
              <button onClick={() => onChange(chosen.filter((s) => s !== name))}
                className="opacity-60 hover:opacity-100" title={`Remove "${name}"`}>×</button>
            )}
          </span>
        );
      })}

      {!disabled && (
        available.length > 0 ? (
          <select value="" className={sel}
            onChange={(e) => { if (e.target.value) onChange([...chosen, e.target.value]); }}>
            <option value="">{placeholder}</option>
            {available.map((s) => (
              <option key={s.id} value={s.name}>{s.category ? `${s.category} · ${s.name}` : s.name}</option>
            ))}
          </select>
        ) : catalog.length === 0 ? (
          <span className={dark ? "text-green-400/40 text-[10px]" : "text-gray-400 text-[11px]"}>
            {emptyHint ?? "no Skills list yet"}
          </span>
        ) : null
      )}
    </span>
  );
}
