/**
 * The template window's provisional pick, and how it is swapped without leaving
 * a trace.
 *
 * Paul, 2026-09-24: a number puts the template on the diagram "provisionally
 * … or use a different number … for that tentative template to be replaced".
 * The replacement used to be `undo()` followed by `applyTemplate()` in the same
 * tick. useDiagram's history snapshot reads the diagram as of the last RENDER,
 * so the entry pushed for the replacement still held the template it was
 * replacing: the third number showed two templates, and "cancel" after two
 * numbers left the first one behind.
 *
 * The swap now restores the diagram the first preview was applied to and
 * applies the new pick on top of it, pushing nothing — the entry the first
 * preview pushed already holds that diagram, so one undo still takes it all
 * off, however many numbers were tried.
 *
 * Restoring a stored diagram is only safe while nothing ELSE has changed it.
 * A co-author's merge replaces the data and clears the history; a keyboard
 * shortcut can edit behind the window. So the preview counts as showing only
 * when the diagram is still EXACTLY the state the preview produced and the
 * history still has the preview's entry on top. Otherwise the old preview is
 * taken off by its ids and the current diagram — with everybody else's changes
 * — is kept.
 *
 * Known limit of that strip: it takes off the preview's elements and
 * connectors, not the room APPLY_TEMPLATE made for them. The lane it grew stays
 * grown, a pool it widened stays wide, and the lanes it pushed down stay down.
 * Telling the preview's growth from the other editor's changes needs the
 * geometry to be recorded per container; until then a slightly roomy lane is
 * the price of never throwing a co-author's work away.
 *
 * Pure. useDiagram holds the state; this decides — and `runTemplateApply`
 * is the order useDiagram's applyTemplate does it in, so a test can run the
 * very same steps.
 */
import type { Connector, DiagramElement } from "./types";

export interface TemplateSnapshot { elements: DiagramElement[]; connectors: Connector[] }

/** A preview's own elements and connectors (the join is found by its ends). */
export interface TemplateIds { elements: string[]; connectors: string[] }

/** What useDiagram remembers about the template it applied last. */
export interface ShownTemplate {
  stamp: number;
  /** The undo entry that takes it off: the top of the history once it was applied. */
  entry: TemplateSnapshot | undefined;
  /** The diagram it was dispatched against. Until the state differs, React has not run it. */
  before: TemplateSnapshot;
  /** The state it produced, read back on the first render after the dispatch. */
  produced: TemplateSnapshot | null;
}

/** Called on every render: the first state that differs from `before` is what the apply produced. */
export function noteProduced(shown: ShownTemplate | null, now: TemplateSnapshot): void {
  if (!shown || shown.produced) return;
  if (now.elements === shown.before.elements && now.connectors === shown.before.connectors) return;
  shown.produced = { elements: now.elements, connectors: now.connectors };
}

/**
 * Is the preview stamped `stamp` still exactly what is on the diagram, with its
 * undo entry still on top? Identity, not content: the question is whether
 * anything at all has happened since, and a state nobody touched is the same
 * object.
 */
export function isStillShowing(
  shown: ShownTemplate | null,
  stamp: number,
  now: TemplateSnapshot,
  topEntry: TemplateSnapshot | undefined,
): boolean {
  return !!shown && shown.stamp === stamp && !!shown.produced
    && now.elements === shown.produced.elements
    && now.connectors === shown.produced.connectors
    && !!topEntry && topEntry === shown.entry;
}

/** Is any of the preview still on the diagram (Ctrl+Z may have taken it off)? */
export function isTemplateOnDiagram(ids: TemplateIds, elements: readonly DiagramElement[]): boolean {
  const mine = new Set(ids.elements);
  return elements.some((e) => mine.has(e.id));
}

/**
 * The diagram with the preview taken off by its ids: its elements, anything
 * mounted on or contained by them, its own connectors and every connector
 * touching what went — the join included.
 */
export function withoutTemplate(now: TemplateSnapshot, ids: TemplateIds): TemplateSnapshot {
  const gone = new Set(ids.elements);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of now.elements) {
      if (gone.has(e.id)) continue;
      if ((e.parentId && gone.has(e.parentId)) || (e.boundaryHostId && gone.has(e.boundaryHostId))) {
        gone.add(e.id);
        grew = true;
      }
    }
  }
  const conns = new Set(ids.connectors);
  return {
    elements: now.elements.filter((e) => !gone.has(e.id)),
    connectors: now.connectors.filter((c) => !conns.has(c.id) && !gone.has(c.sourceId) && !gone.has(c.targetId)),
  };
}

/**
 * What useDiagram's applyTemplate does to the history before it dispatches:
 * which snapshot (if any) it pushes, and which diagram (if any) it puts back
 * before the template goes on.
 *
 * - no `over` (a first preview, the mouse attach, the toolbar): push the
 *   diagram as it is, like every other edit;
 * - `over`, entry "kept": push nothing — the preview's own entry already holds
 *   `over.base` — and put `over.base` back;
 * - `over`, entry "new": `over.base` is the undo entry, and goes back.
 */
export function templateApplyHistory(
  over: { base: TemplateSnapshot; entry: "kept" | "new" } | undefined,
  now: TemplateSnapshot,
): { push: TemplateSnapshot | null; restore: TemplateSnapshot | null } {
  if (!over) return { push: now, restore: null };
  return { push: over.entry === "new" ? over.base : null, restore: over.base };
}

/** What `runTemplateApply` needs from useDiagram (or from a test's model of it). */
export interface TemplateApplySteps {
  /** The diagram as of the last render — what every history snapshot reads. */
  snapshot(): TemplateSnapshot;
  pushHistory(s: TemplateSnapshot): void;
  /** The undo entry on top of the history now. */
  topOfHistory(): TemplateSnapshot | undefined;
  /** Remember what is being shown, for `isStillShowing`. */
  record(shown: ShownTemplate): void;
  /** SET_DATA: put a diagram back. */
  restore(s: TemplateSnapshot): void;
  /** APPLY_TEMPLATE. */
  apply(): void;
}

/**
 * Put a template on the diagram, in the one order the swap depends on:
 *
 *   1. push what `templateApplyHistory` says — the diagram as it is, the
 *      stripped diagram, or nothing when the preview's own entry is kept;
 *   2. record what is shown, its undo entry read AFTER that push: read before
 *      it, the first preview's entry is whatever was on top already, every
 *      later swap looks "changed by something else", and each one pushes an
 *      entry of its own instead of sharing the one;
 *   3. put the base back — without it the next template goes on over the old
 *      one: the third number shows two templates, and "cancel" leaves the
 *      first behind (Paul's bug);
 *   4. apply the template.
 */
export function runTemplateApply(
  over: { base: TemplateSnapshot; entry: "kept" | "new" } | undefined,
  stamp: number,
  steps: TemplateApplySteps,
): void {
  const { push, restore } = templateApplyHistory(over, steps.snapshot());
  if (push) steps.pushHistory(push);
  steps.record({ stamp, entry: steps.topOfHistory(), before: steps.snapshot(), produced: null });
  if (restore) steps.restore(restore);
  steps.apply();
}

/**
 * Take a preview off by its ids when something else has changed the diagram
 * since it was shown: the diagram as it is goes on the history (one undo puts
 * the preview back), and the diagram without it goes on the canvas.
 */
export function runTemplateRemove(
  ids: TemplateIds,
  steps: Pick<TemplateApplySteps, "snapshot" | "pushHistory" | "restore">,
): void {
  const now = steps.snapshot();
  if (!isTemplateOnDiagram(ids, now.elements)) return;
  steps.pushHistory(now);
  steps.restore(withoutTemplate(now, ids));
}

export type PreviewBase =
  | { mode: "restore"; base: TemplateSnapshot }
  | { mode: "strip"; base: TemplateSnapshot }
  | { mode: "fresh"; base: TemplateSnapshot };

/**
 * The diagram the next pick is planned on and applied to — never one with the
 * old preview on it, or the new one would be nudged clear of the old one and
 * the old one would stay.
 *
 * - restore: the preview is exactly as it was left; put back the diagram it
 *   was applied to. Its undo entry already holds that diagram (push nothing).
 * - strip: something else changed the diagram; take the preview off by its ids
 *   and keep the rest. That diagram becomes a NEW undo entry.
 * - fresh: nothing of the preview is left (Ctrl+Z); an ordinary first preview.
 */
export function previewBase(
  provisional: { base: TemplateSnapshot; ids: TemplateIds } | null,
  showing: boolean,
  now: TemplateSnapshot,
): PreviewBase {
  if (provisional && showing) return { mode: "restore", base: provisional.base };
  if (provisional && isTemplateOnDiagram(provisional.ids, now.elements)) {
    return { mode: "strip", base: withoutTemplate(now, provisional.ids) };
  }
  return { mode: "fresh", base: now };
}
