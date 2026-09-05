/**
 * What an .md import would actually DO, decided once.
 *
 * Paul, 2026-09-05: "The User should not have to click one generic button that
 * may or may not do any or all of these. Separate Options would be best here."
 *
 * The screen answers that by showing the file's contents against the library's
 * before writing anything — but a preview is only worth reading if it is the
 * same decision the import then makes. Two copies of "is this chain new?" would
 * drift, and the drift would be invisible: the panel would promise "new" and the
 * import would replace, destroying a regenerated chain's prompts. So both the
 * dry run and the apply loop call this, and it is the only place the question is
 * answered.
 */

/** What the library already holds for a code. Absent = the chain is new. */
export interface ExistingChain {
  code: string;
  /** Prompts currently stored — the count an import would delete. */
  prompts: number;
  published: boolean;
}

export interface ImportPlanRow {
  code: string;
  title: string;
  /** Prompts the FILE carries for this chain. */
  prompts: number;
  exists: boolean;
  /** Prompts already in the library, which a replace destroys. */
  existingPrompts: number;
  published: boolean;
  /**
   * `add` — not in the library, will be created.
   * `replace` — in the library, restated wholesale (processes + prompts deleted).
   * `skip` — left exactly as it is.
   */
  action: "add" | "replace" | "skip";
}

export interface ImportPlanInput {
  /** Chains parsed out of the file. */
  parsed: { code: string; title: string; prompts?: unknown[] }[];
  /** What the library holds for those codes. */
  existing: ExistingChain[];
  /**
   * The codes the user ticked. `null` means "every chain in the file", which is
   * what the old two-button import did and what a scripted call still gets.
   */
  codes?: string[] | null;
  /**
   * Whether a chain already present may be restated. False leaves it alone —
   * so a caller that forgets to ask can only ever ADD, never destroy.
   */
  replace: boolean;
}

export function planLibraryImport(input: ImportPlanInput): ImportPlanRow[] {
  const { parsed, existing, replace } = input;
  const picked = Array.isArray(input.codes) ? new Set(input.codes) : null;
  const byCode = new Map(existing.map((e) => [e.code, e]));

  return parsed.map((c) => {
    const e = byCode.get(c.code);
    const chosen = !picked || picked.has(c.code);
    // Order matters: an unticked chain is skipped whether it is new or not, and
    // an existing chain is skipped unless replacing was asked for explicitly.
    const action: ImportPlanRow["action"] =
      !chosen ? "skip"
        : !e ? "add"
          : replace ? "replace"
            : "skip";
    return {
      code: c.code,
      title: c.title,
      prompts: c.prompts?.length ?? 0,
      exists: !!e,
      existingPrompts: e?.prompts ?? 0,
      published: !!e?.published,
      action,
    };
  });
}

/** The one-line summary a confirmation needs: how much is at stake. */
export function importPlanTotals(rows: ImportPlanRow[]) {
  const adding = rows.filter((r) => r.action === "add");
  const replacing = rows.filter((r) => r.action === "replace");
  return {
    adding: adding.length,
    replacing: replacing.length,
    skipping: rows.filter((r) => r.action === "skip").length,
    /** Prompts that would be DELETED. The number that makes this irreversible. */
    promptsDestroyed: replacing.reduce((t, r) => t + r.existingPrompts, 0),
    promptsWritten: [...adding, ...replacing].reduce((t, r) => t + r.prompts, 0),
  };
}
