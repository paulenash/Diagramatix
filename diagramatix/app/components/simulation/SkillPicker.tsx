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
  holders, holderScope,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  orgId?: string;
  disabled?: boolean;
  placeholder?: string;
  /**
   * How many people on the RELEVANT team hold each skill.
   *
   * A requirement nobody can satisfy is the failure this exists to surface, and
   * it has several causes that look identical on screen: a bundle (nobody ever
   * holds the bundle NAME, only its leaves), a typo, a retired skill, a skill
   * held only by people on another team, or the last holder having left. Until
   * now all of them were discoverable only by running readiness.
   *
   * Omitted where there is no team to count against — on a PERSON, the question
   * is meaningless.
   */
  holders?: Record<string, number>;
  /** Whose roster the counts are for, so "0" says 0 OF WHAT. */
  holderScope?: string;
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
        const held = holders?.[name];
        const nobody = holders !== undefined && (held ?? 0) === 0;
        return (
          <span key={name}
            title={unknown
              ? `"${name}" is not in the Skills list — it still works, but it cannot be picked elsewhere until it is added`
              : catalog.find((s) => s.name === name)?.description ?? name}
            className={`inline-flex items-center gap-1 border rounded-full px-1.5 text-[10px] leading-4 ${unknown || nobody ? chipUnknown : chip}`}>
            {(unknown || nobody) && <span aria-hidden>⚠</span>}
            {name}
            {holders !== undefined && (
              <span
                className={nobody ? "font-semibold" : "opacity-60"}
                title={nobody
                  ? `Nobody${holderScope ? " on " + holderScope : ""} holds this, so the work can never start`
                  : `${held} ${held === 1 ? "person" : "people"}${holderScope ? " on " + holderScope : ""} hold${held === 1 ? "s" : ""} this`}
              >
                {nobody ? "0" : held}
              </span>
            )}
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
            {/* The count is in the OPTION as well as the chip, so an
                unsatisfiable requirement is visible BEFORE it is chosen rather
                than after. "(0)" beside a name is the cheapest possible way to
                say "picking this stops the work". */}
            {available.map((s) => {
              const n = holders?.[s.name];
              const suffix = holders === undefined ? "" : n ? ` (${n})` : " (0 — nobody)";
              return (
                <option key={s.id} value={s.name}>
                  {(s.category ? `${s.category} · ${s.name}` : s.name) + suffix}
                </option>
              );
            })}
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
