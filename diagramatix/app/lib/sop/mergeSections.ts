/**
 * Non-destructive SOP regenerate — merge freshly-generated AI sections into the
 * existing (possibly hand-edited) document by SECTION IDENTITY, instead of the old
 * delete-all + recreate that discarded every edit and author-added section.
 *
 * Rules (per author intent):
 *  - Author-added sections (no `key`) are always kept, in place.
 *  - An AI section the author LOCKED, or EDITED (current body ≠ the stored hash of
 *    the AI's last output), is kept — never overwritten.
 *  - An untouched AI section is refreshed with the new prose.
 *  - An AI section that no longer applies (its key isn't regenerated) is dropped if
 *    untouched, kept if locked/edited.
 *  - Brand-new AI sections (new keys) are appended.
 *  - Figure/image sections are preserved and floated to the end.
 *
 * Pure + hash-injected so it is unit-testable without a DB or crypto.
 */
export interface ExistingSopSection {
  heading: string | null;
  bodyMarkdown: string;
  image: string | null;
  imageCaption: string | null;
  key: string | null;
  aiBodyHash: string | null;
  locked: boolean;
  sortOrder: number;
}

export interface FreshSopSection {
  heading: string;
  body: string;
  key: string | null;
}

export interface MergedSopSection {
  heading: string | null;
  bodyMarkdown: string;
  image: string | null;
  imageCaption: string | null;
  key: string | null;
  aiBodyHash: string | null;
  locked: boolean;
}

export interface MergeSummary { refreshed: number; kept: number; added: number; dropped: number }
export interface MergeResult { sections: MergedSopSection[]; summary: MergeSummary }

const norm = (h: string | null | undefined) => (h ?? "").trim().toLowerCase();

/** Merge fresh AI sections into existing ones by key/heading identity. `hash`
 *  maps a body to the same digest used when the AI output was stored. */
export function mergeSopSections(
  existing: ExistingSopSection[],
  fresh: FreshSopSection[],
  hash: (body: string) => string,
): MergeResult {
  const freshByKey = new Map<string, FreshSopSection>();
  const headingToKey = new Map<string, string>();
  for (const f of fresh) {
    if (!f.key) continue;
    freshByKey.set(f.key, f);
    headingToKey.set(norm(f.heading), f.key);
  }

  const isEdited = (e: ExistingSopSection) => e.aiBodyHash == null || hash(e.bodyMarkdown) !== e.aiBodyHash;

  const out: MergedSopSection[] = [];
  const images: MergedSopSection[] = [];
  const consumed = new Set<string>();
  let refreshed = 0, kept = 0, added = 0, dropped = 0;

  for (const e of [...existing].sort((a, b) => a.sortOrder - b.sortOrder)) {
    // Figure / image sections: always keep, floated to the end.
    if (e.image) {
      images.push({ heading: e.heading, bodyMarkdown: e.bodyMarkdown, image: e.image, imageCaption: e.imageCaption, key: e.key, aiBodyHash: e.aiBodyHash, locked: e.locked });
      kept++;
      continue;
    }
    // Resolve the section's key (migration: match a legacy null-key section by heading).
    const key = e.key ?? (e.heading ? headingToKey.get(norm(e.heading)) ?? null : null);

    if (key && freshByKey.has(key)) {
      const f = freshByKey.get(key)!;
      consumed.add(key);
      if (e.locked || isEdited(e)) {
        out.push({ heading: e.heading, bodyMarkdown: e.bodyMarkdown, image: null, imageCaption: null, key, aiBodyHash: e.aiBodyHash, locked: e.locked });
        kept++;
      } else {
        out.push({ heading: f.heading, bodyMarkdown: f.body, image: null, imageCaption: null, key, aiBodyHash: hash(f.body), locked: false });
        refreshed++;
      }
    } else if (key) {
      // An AI section whose key wasn't regenerated (no longer applies).
      if (e.locked || isEdited(e)) {
        out.push({ heading: e.heading, bodyMarkdown: e.bodyMarkdown, image: null, imageCaption: null, key, aiBodyHash: e.aiBodyHash, locked: e.locked });
        kept++;
      } else {
        dropped++;
      }
    } else {
      // Author-added section — always kept, in place.
      out.push({ heading: e.heading, bodyMarkdown: e.bodyMarkdown, image: null, imageCaption: null, key: null, aiBodyHash: e.aiBodyHash, locked: e.locked });
      kept++;
    }
  }

  // Append brand-new AI sections (never seen before), in fresh (template) order.
  for (const f of fresh) {
    if (!f.key || consumed.has(f.key)) continue;
    consumed.add(f.key);
    out.push({ heading: f.heading, bodyMarkdown: f.body, image: null, imageCaption: null, key: f.key, aiBodyHash: hash(f.body), locked: false });
    added++;
  }

  // The Process Diagram figure leads the document; text sections follow.
  return { sections: [...images, ...out], summary: { refreshed, kept, added, dropped } };
}
