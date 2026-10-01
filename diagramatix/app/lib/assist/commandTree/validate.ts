/**
 * Validating an edited conventions table — what the SuperAdmin tile saves.
 *
 * Returns the cleaned table, or every problem in plain English. Never throws.
 */
import type { Conventions, SlotDef, SlotKind } from "./conventions";
import { parsePattern } from "./notation";

const SLOT_KINDS: readonly SlotKind[] = ["free", "names", "number", "distance", "pattern"];
const SLOT_NAME_RE = /^[a-z][a-z0-9_]{1,40}$/;

export function validateConventions(raw: unknown): { ok: true; conventions: Conventions } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { ok: false, errors: ["the conventions must be a list"] };
  if (raw.length > 60) return { ok: false, errors: ["too many conventions (60 at most)"] };
  const seen = new Set<string>();
  const out: Conventions = [];
  raw.forEach((r, i) => {
    const at = `convention ${i + 1}`;
    if (!r || typeof r !== "object") { errors.push(`${at}: not an object`); return; }
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!SLOT_NAME_RE.test(name)) { errors.push(`${at}: the name “${name}” must be lower case letters, digits and _ (for example existing_element_name)`); return; }
    if (seen.has(name)) { errors.push(`<${name}> is defined twice`); return; }
    seen.add(name);
    const kind = o.kind as SlotKind;
    if (!SLOT_KINDS.includes(kind)) { errors.push(`<${name}>: kind must be one of ${SLOT_KINDS.join(", ")}`); return; }
    const means = typeof o.means === "string" ? o.means.trim() : "";
    const example = typeof o.example === "string" ? o.example.trim() : "";
    if (!means || means.length > 500) errors.push(`<${name}>: say what it means (1–500 characters)`);
    if (!example || example.length > 120) errors.push(`<${name}>: give an example (1–120 characters)`);
    const def: SlotDef = { name, kind, means, example };
    if (kind === "names") {
      if (o.source !== "elements" && o.source !== "labels") errors.push(`<${name}>: a names convention needs a source — elements or labels`);
      else def.source = o.source;
    }
    if (kind === "pattern") {
      const pattern = typeof o.pattern === "string" ? o.pattern.trim() : "";
      if (!pattern || pattern.length > 600) errors.push(`<${name}>: a pattern convention needs its phrases (1–600 characters)`);
      else {
        try { parsePattern(pattern); def.pattern = pattern; }
        catch (e) { errors.push(`<${name}>: the phrases do not parse — ${(e as Error).message}`); }
      }
    }
    if (o.maxWords !== undefined && o.maxWords !== null && o.maxWords !== "") {
      const n = Number(o.maxWords);
      if (!Number.isInteger(n) || n < 1 || n > 40) errors.push(`<${name}>: most words must be a whole number from 1 to 40`);
      else def.maxWords = n;
    }
    out.push(def);
  });
  return errors.length ? { ok: false, errors } : { ok: true, conventions: out };
}
