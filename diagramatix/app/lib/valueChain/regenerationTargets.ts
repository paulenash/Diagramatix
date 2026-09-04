import type { MdPromptType } from "./promptTemplates";

/**
 * Which prompts a Regenerate request should actually rewrite.
 *
 * Pulled out of the route so it can be tested. Every branch here spends AI calls
 * or fails to spend them, and both are expensive in their own way: regenerating
 * a prompt nobody asked for costs money and overwrites something that may have
 * been fine, while regenerating nothing and reporting success reads as "done"
 * and leaves the defect exactly where it was.
 *
 * Paul, 2026-09-04, after six of ten V22 prompts came back truncated: selecting
 * a SUBSET had to be possible, because the screen offered only all-of-a-type or
 * one-at-a-time, and six single regenerations mean six waits.
 */
export interface RegenTarget {
  type: MdPromptType;
  /** Process code for a BPMN prompt; the chain's own code for a chain-level one. */
  code: string;
  title: string;
}

export interface RegenSelection {
  targets: RegenTarget[];
  /** Requested process codes this chain does not have. */
  unknown: string[];
}

export function selectRegenerationTargets(args: {
  types: MdPromptType[];
  processes: { code: string; title: string }[];
  chainCode: string;
  chainTitle: string;
  /** Process codes to narrow to. EMPTY means "no narrowing", not "nothing". */
  only?: string[];
}): RegenSelection {
  const { types, processes, chainCode, chainTitle } = args;
  const only = new Set(args.only ?? []);

  const known = new Set(processes.map((p) => p.code));
  const unknown = [...only].filter((c) => !known.has(c));

  const targets: RegenTarget[] = [];
  for (const t of types) {
    if (t === "bpmn") {
      for (const p of processes) {
        if (only.size && !only.has(p.code)) continue;
        targets.push({ type: "bpmn", code: p.code, title: p.title });
      }
    } else if (only.size === 0) {
      // Naming specific processes is a narrower instruction than "this type".
      // Rewriting the chain-level prompts as well would spend calls nobody asked
      // for, and overwrite prompts the request never mentioned.
      targets.push({ type: t, code: chainCode, title: chainTitle });
    }
  }
  return { targets, unknown };
}
