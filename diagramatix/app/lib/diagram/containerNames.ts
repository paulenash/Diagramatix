/**
 * Naming a pool, lane or sublane — one place, because every path names them.
 *
 * A container's name must be UNIQUE across the diagram (it is how the user
 * refers to it — by mouse, by voice, in a report) and must never be the bare
 * kind word. Lifted out of the reducer on 2026-09-23 so the layer that REPORTS
 * what a command did can work out the same names the reducer will give, rather
 * than printing what was asked for.
 *
 * That mattered in Paul's log: "add another lane to pool three" answered
 * `added 1 lane to Pool 3: Lane 1` — twice, naming a lane that already existed,
 * while the reducer was quietly creating "Lane 1 2" because the voice grammar
 * had asked for the taken name "Lane 1". The grammar now asks for the bare kind
 * and the numbering happens here, where the diagram is in view.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { capitaliseFirstWord } from "./nameCase";

export type ContainerKind = "Pool" | "Lane" | "Sublane";

/**
 * The word a generated name is built from. A sublane is called "Sub 1", not
 * "Sublane 1" (Paul, 2026-09-23) — the header strip is 36px wide and the name
 * is written down it, so every character costs height that the band has to be
 * given. "Sublane 3" needs about 92px before it will fit; "Sub 3" needs 58,
 * which is the difference between a sublane that can be added and one that is
 * refused.
 */
const STEM: Record<ContainerKind, string> = { Pool: "Pool", Lane: "Lane", Sublane: "Sub" };

/** The words that mean "no name given" for this kind — the kind itself, or its stem. */
const isBareFor = (kind: ContainerKind, s: string) =>
  s === "" || s === kind.toLowerCase() || s === STEM[kind].toLowerCase();

const isContainer = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";

/**
 * A unique, never-bare name for one container.
 *
 * Capitalise first, THEN de-duplicate, so "sales" beside "Sales" is caught as
 * the clash it is rather than slipping past on case (Paul, 2026-09-21: "lanes
 * are created without capitalised names").
 */
export function uniqueContainerLabel(
  elements: DiagramElement[],
  desired: string | undefined,
  kind: ContainerKind,
  excludeId?: string,
): string {
  const taken = new Set(
    elements
      .filter((e) => isContainer(e) && e.id !== excludeId)
      .map((e) => (e.label ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const base = capitaliseFirstWord((desired ?? "").trim());
  if (isBareFor(kind, base.toLowerCase())) {
    const stem = STEM[kind];
    let n = 1;
    while (taken.has(`${stem.toLowerCase()} ${n}`)) n++;
    return `${stem} ${n}`;
  }
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base.toLowerCase()} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * The names a batch of new containers will actually get — each one unique
 * against the diagram AND against the ones before it in the same batch.
 *
 * The reducer names them this way; the command log asks this to say what it
 * did. Two callers, one answer, so the sentence the user reads is the name
 * they can then say back.
 */
export function nextContainerLabels(
  elements: readonly DiagramElement[],
  desired: readonly (string | undefined)[],
  kind: ContainerKind,
): string[] {
  const acc: DiagramElement[] = [...elements];
  return desired.map((d) => {
    const label = uniqueContainerLabel(acc, d, kind);
    // A placeholder stands in for the container about to exist, so the next
    // name in the batch cannot collide with it.
    acc.push({ id: `__pending_${acc.length}`, type: "lane", label } as unknown as DiagramElement);
    return label;
  });
}
