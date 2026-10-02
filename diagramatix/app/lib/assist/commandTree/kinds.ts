/**
 * The KINDS of thing a command can be about — one vocabulary for "what is selected", for the patterns that
 * say what they apply to (`@on pool lane`), and for the Voice Assist Help tile's stand-ins.
 *
 * Paul, 2026-10-02: "As soon as I select an element the help needs to just display commands that are relevant
 * to that selection — if I select an EP the command 'shrink' should not appear, as that only, currently,
 * applies to pools." So each command pattern can say which kinds it applies to; the help shows only those that
 * apply to what is selected.
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "../../diagram/types";

/** Every kind a selection can be. */
export const KIND_IDS = [
  "black-box-pool", "white-box-pool", "lane", "sublane", "task", "subprocess", "expanded-subprocess",
  "start-event", "end-event", "inline-event", "boundary-event", "gateway",
  "data-object", "data-store", "text-annotation", "group",
  "sequence-connector", "message-connector", "association",
] as const;
export type KindId = (typeof KIND_IDS)[number];

/** Words a pattern can use for several kinds at once. A kind's own id is always allowed too. */
export const KIND_GROUPS: Readonly<Record<string, readonly KindId[]>> = {
  pool: ["black-box-pool", "white-box-pool"],
  lane: ["lane", "sublane"],
  activity: ["task", "subprocess", "expanded-subprocess"],
  event: ["start-event", "end-event", "inline-event", "boundary-event"],
  data: ["data-object", "data-store"],
  connector: ["sequence-connector", "message-connector", "association"],
  /** What a sequence flow can join: activities, events and gateways. */
  flownode: ["task", "subprocess", "expanded-subprocess", "start-event", "end-event", "inline-event", "boundary-event", "gateway"],
  /** Everything drawn in a lane (not a container, not a connector). */
  node: [
    "task", "subprocess", "expanded-subprocess", "start-event", "end-event", "inline-event", "boundary-event", "gateway",
    "data-object", "data-store", "text-annotation", "group",
  ],
};

/** What an `@on` token stands for, or null if it is not a kind or a group. */
export function expandKindToken(token: string): readonly string[] | null {
  const t = token.toLowerCase();
  if (KIND_GROUPS[t]) return KIND_GROUPS[t];
  return (KIND_IDS as readonly string[]).includes(t) ? [t] : null;
}

/** The kind an element is — or undefined for a type the help does not tell apart (then nothing is filtered). */
export function kindOfElement(e: DiagramElement, elements: readonly DiagramElement[]): KindId | undefined {
  switch (e.type) {
    case "pool": return (e.properties as { poolType?: string } | undefined)?.poolType === "black-box" ? "black-box-pool" : "white-box-pool";
    case "lane": return elements.some((p) => p.id === e.parentId && p.type === "lane") ? "sublane" : "lane";
    case "task": return "task";
    case "subprocess": return "subprocess";
    case "subprocess-expanded": return "expanded-subprocess";
    case "start-event": return "start-event";
    case "end-event": return "end-event";
    case "intermediate-event": return e.boundaryHostId ? "boundary-event" : "inline-event";
    case "gateway": return "gateway";
    case "data-object": return "data-object";
    case "data-store": return "data-store";
    case "text-annotation": return "text-annotation";
    case "group": return "group";
    default: return undefined;
  }
}

export function kindOfConnector(c: Pick<Connector, "type">): KindId | undefined {
  if (c.type === "sequence") return "sequence-connector";
  if (c.type === "messageBPMN") return "message-connector";
  if (c.type === "associationBPMN") return "association";
  return undefined;
}

/**
 * The kinds of what is selected: the elements, or the connector. Kinds the help cannot tell apart are left out,
 * so a selection of only such things filters nothing.
 */
export function selectedKinds(
  elements: readonly DiagramElement[],
  selectedIds: Iterable<string>,
  selectedConnector?: Pick<Connector, "type"> | null,
): KindId[] {
  const out = new Set<KindId>();
  for (const id of selectedIds) {
    const e = elements.find((x) => x.id === id);
    const k = e ? kindOfElement(e, elements) : undefined;
    if (k) out.add(k);
  }
  if (!out.size && selectedConnector) {
    const k = kindOfConnector(selectedConnector);
    if (k) out.add(k);
  }
  return [...out];
}

/** Does a command that applies to `on` (kinds / groups) apply to a selection of `selected`? Any one match is enough. */
export function appliesTo(on: readonly string[], selected: readonly string[]): boolean {
  const set = new Set(on.flatMap((t) => expandKindToken(t) ?? []));
  return selected.some((k) => set.has(k));
}
