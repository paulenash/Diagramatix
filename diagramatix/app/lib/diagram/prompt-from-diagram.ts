import type { ArchimateConnectorType, Connector, DiagramElement, DiagramType } from "./types";
import { findShapeByKey } from "@/app/lib/archimate/catalogue";
import { ARCHI_REL_NAME } from "./archimateConnectorStyle";
import { laneOf as laneOfShared, poolOf as poolOfShared, isInside as isInsideShared } from "./containment";

/**
 * Router: picks the per-diagram-type prompt generator. Falls back to the
 * BPMN one for any type we haven't taught a structure to yet.
 */
export function buildPromptFromDiagram(
  elements: DiagramElement[],
  connectors: Connector[],
  diagramType: DiagramType,
): string {
  if (diagramType === "context" || diagramType === "basic") {
    return buildContextPrompt(elements, connectors);
  }
  if (diagramType === "archimate") {
    return buildArchimatePrompt(elements, connectors);
  }
  return buildBpmnPrompt(elements, connectors);
}

/** Plain-English meaning of each ArchiMate relationship, so the description (and
 *  the Staff Narrative built from it) can explain what the connector represents,
 *  not just name it. Keyed by the connector's ArchimateConnectorType. */
const ARCHI_REL_MEANING: Record<ArchimateConnectorType, string> = {
  "archi-composition": "the source is composed of the target — a whole–part link where the part belongs to, and cannot exist without, the whole",
  "archi-aggregation": "the source aggregates the target — a whole–part link where the part can also exist on its own",
  "archi-assignment": "the source is assigned to the target — an active element performs, or is allocated to, that behaviour / node",
  "archi-realisation": "the source realises the target — it provides a concrete implementation of a more abstract element",
  "archi-serving": "the source serves the target — it provides a service or functionality that the target uses",
  "archi-access": "the source accesses the target — behaviour reads from and/or writes to that data / object",
  "archi-influence": "the source influences the target — it affects the achievement of that (usually motivational) element",
  "archi-association": "the source is associated with the target — an unspecified structural relationship",
  "archi-association-directed": "the source is associated with the target, directed towards it",
  "archi-triggering": "the source triggers the target — a temporal / causal flow that passes control on",
  "archi-flow": "value or information flows from the source to the target",
  "archi-specialisation": "the source is a specialisation (a more specific kind) of the target",
};

/**
 * Reverse-engineer an ArchiMate diagram into a STRUCTURAL description prompt.
 * ArchiMate models are structural, so this focuses on (1) every element with its
 * ArchiMate type and layer, (2) what each container holds, and (3) every
 * relationship with what it represents — the material a human (or the Staff
 * Narrative generator) needs to talk through the model. Re-feedable into the
 * ArchiMate AI generator.
 */
export function buildArchimatePrompt(elements: DiagramElement[], connectors: Connector[]): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const labelOf = (e: DiagramElement | undefined): string =>
    e ? (e.label?.trim() || "<unnamed>") : "<missing>";

  // Real ArchiMate nodes (skip on-canvas notes like the AI-prompt annotation).
  const nodes = elements.filter((e) => e.type === "archimate-shape");

  // Resolve an element's ArchiMate type name + layer from the shape catalogue,
  // falling back to a humanised shapeKey when the catalogue isn't loaded.
  const kindOf = (e: DiagramElement): { typeName: string; layer: string } => {
    const key = e.properties?.shapeKey as string | undefined;
    const entry = key ? findShapeByKey(key) : undefined;
    return {
      typeName: entry?.name ?? (key ? cap(key) : "Element"),
      layer: entry?.category ? cap(entry.category) : "Other",
    };
  };

  const lines: string[] = [];
  lines.push("# ArchiMate Model");
  lines.push("");
  lines.push("This is a structural model. Below are the elements (by layer), what each container holds, and every relationship with its meaning.");
  lines.push("");

  if (nodes.length === 0) {
    lines.push("- (No ArchiMate elements in this diagram yet.)");
    return lines.join("\n").trimEnd();
  }

  // ── Elements grouped by layer ──
  lines.push("## Elements");
  lines.push("");
  const byLayer = new Map<string, DiagramElement[]>();
  for (const n of nodes) {
    const { layer } = kindOf(n);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }
  for (const [layer, group] of byLayer) {
    lines.push(`### ${layer} layer`);
    for (const n of group) {
      const { typeName } = kindOf(n);
      const desc = (n.properties?.description as string | undefined)?.trim();
      lines.push(`- "${labelOf(n)}" (${typeName})${desc ? ` — ${desc}` : ""}`);
    }
    lines.push("");
  }

  // ── Containers (nesting): what sits inside each element ──
  const childrenOf = new Map<string, DiagramElement[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n);
  }
  lines.push("## Containers (what's inside each)");
  lines.push("");
  const containerIds = [...childrenOf.keys()].filter((id) => byId.get(id)?.type === "archimate-shape");
  if (containerIds.length === 0) {
    lines.push("- (No nested/grouping elements — the model is flat.)");
  } else {
    for (const cid of containerIds) {
      const container = byId.get(cid)!;
      const { typeName } = kindOf(container);
      const kids = childrenOf.get(cid)!;
      lines.push(`- "${labelOf(container)}" (${typeName}) contains:`);
      for (const k of kids) {
        const { typeName: kt } = kindOf(k);
        lines.push(`  - "${labelOf(k)}" (${kt})`);
      }
    }
  }
  lines.push("");

  // ── Relationships ──
  lines.push("## Relationships");
  lines.push("");
  const archiRels = connectors.filter((c) => (c.type as string).startsWith("archi-"));
  if (archiRels.length === 0) {
    lines.push("- (No relationships drawn between elements.)");
  } else {
    for (const c of archiRels) {
      const t = c.type as ArchimateConnectorType;
      const relName = ARCHI_REL_NAME[t] ?? cap((c.type as string).replace(/^archi-/, ""));
      const meaning = ARCHI_REL_MEANING[t] ?? "a relationship between the two elements";
      const lbl = c.label?.trim();
      lines.push(
        `- "${labelOf(byId.get(c.sourceId))}" —[${relName}]→ "${labelOf(byId.get(c.targetId))}"${lbl ? ` (labelled "${lbl}")` : ""}: ${meaning}.`,
      );
    }
  }

  return lines.join("\n").trimEnd();
}

/**
 * Reverse-engineer a BPMN diagram into a NARRATIVE prompt that reads like
 * a human's description of the process — the way Greg asks for it
 * (start trigger → tasks per actor → external participants → systems →
 * explicit pools/lanes). Designed to be re-fed into the BPMN AI generator
 * to recreate or adapt the diagram. Verb-phrase task labels carry over
 * verbatim — refining them is left to the human after the prompt is
 * pasted into the prompt box.
 *
 * Output sections:
 *   - **Trigger**       — what kicks the process off
 *   - **What happens**  — flow narrative grouped by actor (lane / pool),
 *                         honouring sequence ordering and weaving in
 *                         message touches and gateway branches
 *   - **External participants** — black-box pools where isSystem=false
 *   - **IT systems**    — black-box pools where isSystem=true
 *   - **Pools and Lanes** — explicit structural summary (point 6 of
 *                         Greg's list — "of course you can explicitly
 *                         say what Pools and Lanes you want")
 */
export function buildBpmnPrompt(elements: DiagramElement[], connectors: Connector[]): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const labelOf = (e: DiagramElement | undefined): string =>
    e ? (e.label?.trim() || `<unnamed ${e.type}>`) : "<missing>";

  const pools = elements.filter((e) => e.type === "pool");
  if (pools.length === 0) {
    return "(No pools in this diagram — nothing to describe.)";
  }

  // Pool categorisation.
  const whitePools = pools.filter((p) => ((p.properties?.poolType as string | undefined) ?? "white-box") === "white-box");
  const externalPools = pools.filter((p) =>
    (p.properties?.poolType as string | undefined) === "black-box" && !p.properties?.isSystem,
  );
  const systemPools = pools.filter((p) =>
    (p.properties?.poolType as string | undefined) === "black-box" && !!p.properties?.isSystem,
  );

  // Container-membership resolution (shared helpers, bound to this diagram's index).
  const laneOf = (el: DiagramElement | undefined) => laneOfShared(el, byId);
  const poolOf = (el: DiagramElement | undefined) => poolOfShared(el, byId);
  const isInside = (child: DiagramElement, ancestorId: string) => isInsideShared(child, ancestorId, byId);

  // Sequence-flow adjacency (with effective-endpoint resolution for
  // boundary events — connectors stored on the host's id are re-attributed
  // to the nearest boundary event when geometry indicates so).
  const sequences = connectors.filter((c) => c.type === "sequence");
  const messages = connectors.filter((c) => c.type === "message" || c.type === "messageBPMN");
  const outgoing = new Map<string, Connector[]>();
  for (const c of sequences) {
    if (!outgoing.has(c.sourceId)) outgoing.set(c.sourceId, []);
    outgoing.get(c.sourceId)!.push(c);
  }
  // Inbound count, so the walk can tell a MERGE from an ordinary step: a
  // branch has to stop at the merge and say so, or the first branch to reach
  // it swallows the whole shared tail (Paul, 2026-09-01).
  const inboundCount = new Map<string, number>();
  for (const c of sequences) inboundCount.set(c.targetId, (inboundCount.get(c.targetId) ?? 0) + 1);
  const isMerge = (id: string) => (inboundCount.get(id) ?? 0) > 1;

  // Messages indexed by the non-pool endpoint (in either direction).
  const messagesTouching = new Map<string, Array<{ peer: DiagramElement; direction: "out" | "in"; label: string }>>();
  for (const c of messages) {
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcIsPool = src.type === "pool";
    const tgtIsPool = tgt.type === "pool";
    const lbl = c.label?.trim() ?? "";
    if (!srcIsPool && tgtIsPool) {
      const arr = messagesTouching.get(src.id) ?? [];
      arr.push({ peer: tgt, direction: "out", label: lbl });
      messagesTouching.set(src.id, arr);
    } else if (srcIsPool && !tgtIsPool) {
      const arr = messagesTouching.get(tgt.id) ?? [];
      arr.push({ peer: src, direction: "in", label: lbl });
      messagesTouching.set(tgt.id, arr);
    }
  }

  // Associations to data objects / data stores indexed by the non-data
  // endpoint (typically a task). BPMN association direction tells us
  // read vs write:
  //   task  → data  = task writes to data
  //   data  → task  = task reads from data
  // (Non-directed associations are treated as "uses".)
  const DATA_TYPES = new Set(["data-object", "data-store"]);
  const associations = connectors.filter(
    (c) => c.type === "associationBPMN" || c.type === "association",
  );
  type DataTouch = { peer: DiagramElement; direction: "reads" | "writes" | "uses" };
  const dataTouching = new Map<string, DataTouch[]>();
  for (const c of associations) {
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcIsData = DATA_TYPES.has(src.type);
    const tgtIsData = DATA_TYPES.has(tgt.type);
    if (srcIsData === tgtIsData) continue; // not a task↔data association
    const taskEl = srcIsData ? tgt : src;
    const dataEl = srcIsData ? src : tgt;
    const directed = c.directionType === "directed" || c.directionType === "open-directed";
    let direction: DataTouch["direction"];
    if (!directed) direction = "uses";
    else if (srcIsData) direction = "reads"; // data → task
    else direction = "writes";                 // task → data
    const arr = dataTouching.get(taskEl.id) ?? [];
    arr.push({ peer: dataEl, direction });
    dataTouching.set(taskEl.id, arr);
  }

  // Render a single non-flow-control element (task / subprocess / event) as
  // a short verb-phrase action. Message-flow touches and data-object /
  // data-store associations are both surfaced in-line as parenthetical
  // notes so the prompt stays narrative.
  function renderAction(el: DiagramElement): string {
    const lbl = labelOf(el);
    const tags: string[] = [];
    for (const m of messagesTouching.get(el.id) ?? []) {
      const peer = labelOf(m.peer);
      const lbl2 = m.label ? ` "${m.label}"` : "";
      tags.push(m.direction === "out" ? `sends${lbl2} to ${peer}` : `receives${lbl2} from ${peer}`);
    }
    for (const d of dataTouching.get(el.id) ?? []) {
      const peerKind = d.peer.type === "data-store" ? "data store" : "data object";
      tags.push(`${d.direction} ${peerKind} "${labelOf(d.peer)}"`);
    }
    const tagStr = tags.length ? ` (${tags.join("; ")})` : "";
    if (el.type === "task") return `${lbl}${tagStr}`;
    if (el.type === "subprocess") return `[Subprocess] ${lbl}${tagStr}`;
    if (el.type === "subprocess-expanded") return `[Expanded Subprocess] ${lbl}${tagStr}`;
    if (el.type === "intermediate-event") return `[Intermediate event] ${lbl}${tagStr}`;
    return `${lbl}${tagStr}`;
  }

  const sectionLines: string[] = [];

  // ── Trigger ──
  // Pool-level start events on white-box pools.
  const startEvents = elements.filter((e) =>
    e.type === "start-event" && !e.boundaryHostId && whitePools.some((wp) => poolOf(e)?.id === wp.id) && !descendsFromSubprocess(e),
  );
  sectionLines.push("**Trigger**");
  if (startEvents.length === 0) {
    sectionLines.push("- (no start event found)");
  } else {
    for (const se of startEvents) {
      const incoming = messagesTouching.get(se.id) ?? [];
      const fromMsg = incoming.find((m) => m.direction === "in");
      const lbl = labelOf(se);
      if (fromMsg) {
        const ptype = (fromMsg.peer.properties?.poolType as string | undefined) ?? "black-box";
        const isSys = !!fromMsg.peer.properties?.isSystem;
        const role = ptype === "black-box" ? (isSys ? " (IT system)" : " (external)") : "";
        sectionLines.push(`- The process starts when ${labelOf(fromMsg.peer)}${role} sends${fromMsg.label ? ` "${fromMsg.label}"` : ""} — ${lbl}.`);
      } else {
        sectionLines.push(`- The process starts when ${lbl}.`);
      }
    }
  }
  sectionLines.push("");

  function descendsFromSubprocess(el: DiagramElement): boolean {
    let cur: DiagramElement | undefined = el;
    let g = 0;
    while (cur && g++ < 16) {
      const p: DiagramElement | undefined = cur.parentId ? byId.get(cur.parentId) : undefined;
      if (!p) return false;
      if (p.type === "subprocess-expanded" || p.type === "subprocess") return true;
      cur = p;
    }
    return false;
  }

  // ── What happens (flow narrative) ──
  sectionLines.push("**What happens**");
  // Walk sequence flow from each start, emitting actor-grouped narrative.
  // Cycles are guarded by a visited set; gateways are described inline.
  const narrativeLines: string[] = [];
  const renderedNodes = new Set<string>();

  type StepResult = { line?: string; descendIntoSub?: DiagramElement };
  function describeStep(el: DiagramElement, indent: number): StepResult {
    const pad = "  ".repeat(indent);
    if (el.type === "end-event") {
      return { line: `${pad}- The process ends with **${labelOf(el)}**.` };
    }
    if (el.type === "gateway") {
      const gt = el.gatewayType;
      const gtTag = (gt && gt !== "none") ? `${cap(gt)} ` : "";
      const out = outgoing.get(el.id) ?? [];
      if (out.length <= 1) {
        // Converging gateway — silent. Branches were described from the
        // diverging side; the merge is just where they reconnect.
        return {};
      }
      // Diverging — emit just the header. Each branch is walked recursively
      // below (in `walk`) under its own "On <flow label>:" sub-heading so
      // we don't list targets twice (once as summary, once as steps).
      return { line: `${pad}- Decision (${gtTag}gateway "${labelOf(el)}"):` };
    }
    if (el.type === "subprocess-expanded" || el.type === "subprocess") {
      // Only promise inner steps when there are some. A COLLAPSED subprocess
      // has no internal start event, so "see steps below" was followed by
      // nothing — text that reads as truncation, and tells a regeneration to
      // expect detail that was never there.
      const hasInner = elements.some((e) =>
        e.type === "start-event" && !e.boundaryHostId && isInside(e, el.id));
      return {
        line: `${pad}- **${labelOf(el)}** ${hasInner ? "(subprocess — see steps below)" : "(collapsed subprocess — no inner detail recorded)"}`,
        descendIntoSub: el,
      };
    }
    if (el.type === "task" || el.type === "intermediate-event") {
      return { line: `${pad}- ${renderAction(el)}` };
    }
    if (el.type === "start-event") {
      // Pool-level starts are covered by the Trigger section; don't repeat.
      // Subprocess-internal starts: still useful to anchor the inner flow.
      if (!descendsFromSubprocess(el)) return {};
      return { line: `${pad}- (subprocess starts: ${labelOf(el)})` };
    }
    return { line: `${pad}- ${labelOf(el)}` };
  }

  /**
   * Walk one line of flow, emitting a bullet per step.
   *
   * Returns HOW the line stopped, because that is the thing the reader — and
   * the model regenerating from this text — cannot otherwise recover. A branch
   * that rejoins a merge and a branch that simply ends both used to render as
   * a list that stops, and the shared tail after the merge was swallowed by
   * whichever branch happened to reach it first. Paul, 2026-09-01: "the
   * Decisions are not terminated unambiguously ... On needs a better matching
   * end".
   */
  type WalkEnd =
    | { kind: "ended" }                    // an end event closed it
    | { kind: "merge"; mergeId: string }   // it rejoins a converging gateway
    | { kind: "stops" }                    // it runs out of sequence flow
    | { kind: "seen" };                    // it reaches ground already described

  function walk(seedId: string, indent: number, lastLaneId?: string): WalkEnd {
    let curId: string | undefined = seedId;
    let lastLane = lastLaneId;
    while (curId) {
      if (renderedNodes.has(curId)) return { kind: "seen" };
      // A merge belongs to the flow AFTER the branches, not to the branch that
      // reached it first. Stop here and let the caller resume from it.
      //
      // This fires even on the seed: a resumed walk is handed the step AFTER a
      // merge, and when THAT is itself a merge (a nested decision rejoining the
      // outer one) the stop has to propagate, or the outer merge is swallowed
      // by the innermost branch exactly as before.
      if (isMerge(curId)) return { kind: "merge", mergeId: curId };
      renderedNodes.add(curId);
      const el = byId.get(curId);
      if (!el) break;

      // Emit a lane-change heading when the actor changes.
      const lane = laneOf(el);
      const laneId = lane?.id ?? `__${poolOf(el)?.id ?? "no-pool"}`;
      if (laneId !== lastLane) {
        const pad = "  ".repeat(indent);
        const actor = lane ? labelOf(lane) : (poolOf(el) ? `${labelOf(poolOf(el)!)} (no lane)` : "Unknown actor");
        narrativeLines.push(`${pad}**${actor}:**`);
        lastLane = laneId;
      }

      const { line, descendIntoSub } = describeStep(el, indent);
      if (line) narrativeLines.push(line);

      // If the element is a subprocess-expanded, walk its inner flow nested.
      if (descendIntoSub) {
        const innerStarts = elements.filter((e) =>
          e.type === "start-event" && !e.boundaryHostId &&
          isInside(e, descendIntoSub.id),
        );
        for (const is of innerStarts) walk(is.id, indent + 1);
      }

      // Edge-mounted (boundary) events and the exception path each one opens.
      //
      // Nothing FLOWS INTO a boundary event, so the sequence walk never reached
      // one and the whole exception path was simply absent from the description
      // — Paul, 2026-09-02: "Technical Description does not pick up and include
      // EMIEs and associated sub-path flows." Regenerating from that text lost
      // the exception entirely, which is the most consequential kind of silence:
      // the diagram comes back looking complete.
      //
      // Emitted under the host in the master template's own shape (section 5:
      // interrupting or not, type, host, label, what happens next) and closed
      // the same way a branch is, so the reader can tell an exception that ends
      // from one that rejoins.
      for (const ev of elements) {
        if (ev.boundaryHostId !== el.id) continue;
        const pad = "  ".repeat(indent + 1);
        const kind = (ev.properties as Record<string, unknown> | undefined)?.interruptionType === "non-interrupting"
          ? "non-interrupting" : "interrupting";
        const evType = ev.eventType ? `${ev.eventType} ` : "";
        narrativeLines.push(`${pad}- Edge-mounted ${kind} ${evType}event **${labelOf(ev)}** on **${labelOf(el)}**, and on it:`);
        const first = (outgoing.get(ev.id) ?? [])[0];
        const inner = "  ".repeat(indent + 2);
        if (!first) {
          narrativeLines.push(`${inner}- (nothing follows it)`);
          continue;
        }
        const res = walk(first.targetId, indent + 2, lastLane);
        if (res.kind === "merge") {
          narrativeLines.push(`${inner}- End of the **${labelOf(ev)}** path — rejoins the flow at ${describeJoin(res.mergeId)}.`);
        } else if (res.kind === "ended") {
          narrativeLines.push(`${inner}- End of the **${labelOf(ev)}** path.`);
        } else if (res.kind === "seen") {
          narrativeLines.push(`${inner}- End of the **${labelOf(ev)}** path — rejoins a path already described above.`);
        } else {
          narrativeLines.push(`${inner}- End of the **${labelOf(ev)}** path — the path stops here.`);
        }
      }

      if (el.type === "end-event") return { kind: "ended" };

      const outConns: Connector[] = outgoing.get(curId) ?? [];

      // Diverging gateway: walk each branch under its own "On <label>" heading,
      // CLOSE each one with a line saying how it finished, then resume the
      // shared flow from the merge at the DECISION own level.
      if (el.type === "gateway" && outConns.length > 1) {
        const pad = "  ".repeat(indent + 1);
        const merges = new Set<string>();
        for (const c of outConns) {
          const flowLabel = c.label?.trim() || "(unlabelled branch)";
          narrativeLines.push(`${pad}- On **${flowLabel}**:`);
          const res = walk(c.targetId, indent + 2, lastLane);
          const inner = "  ".repeat(indent + 2);
          if (res.kind === "merge") {
            merges.add(res.mergeId);
            narrativeLines.push(`${inner}- End of **${flowLabel}** — rejoins the flow at ${describeJoin(res.mergeId)}.`);
          } else if (res.kind === "ended") {
            narrativeLines.push(`${inner}- End of **${flowLabel}**.`);
          } else if (res.kind === "seen") {
            narrativeLines.push(`${inner}- End of **${flowLabel}** — rejoins a path already described above.`);
          } else {
            narrativeLines.push(`${inner}- End of **${flowLabel}** — the path stops here.`);
          }
        }
        // Every branch that came back rejoins the same merge in a well-formed
        // diagram; when they do not, each is resumed in turn so nothing is lost.
        let last: WalkEnd = { kind: "stops" };
        for (const m of merges) {
          const mEl = byId.get(m);
          if (mEl) {
            // Only announce the continuation once it is known to have steps:
            // one merge can lead straight into another, and a header with
            // nothing under it reads as a truncation.
            const hdr = narrativeLines.push(`${"  ".repeat(indent)}- After ${describeJoin(m)}, the flow continues:`) - 1;
            renderedNodes.add(m);
            const after = outgoing.get(m) ?? [];
            last = after.length === 1
              ? walk(after[0].targetId, indent, lastLane)
              : { kind: "stops" };
            if (narrativeLines.length === hdr + 1) narrativeLines.splice(hdr, 1);
          }
        }
        return merges.size ? last : { kind: "stops" };
      }

      if (outConns.length === 0) return { kind: "stops" };
      curId = outConns[0].targetId;
    }
    return { kind: "stops" };
  }

  /** Name a converging gateway so a branch can point at where it rejoins. */
  function describeJoin(id: string): string {
    const el = byId.get(id);
    if (!el) return "the merge";
    const name = labelOf(el);
    if (el.type === "gateway") return name ? `gateway "${name}"` : "the merge gateway";
    return name ? `**${name}**` : "the shared path";
  }
  for (const se of startEvents) walk(se.id, 0);

  if (narrativeLines.length === 0) {
    sectionLines.push("- (no sequence flow found — diagram has no start event linked by sequence connectors)");
  } else {
    for (const l of narrativeLines) sectionLines.push(l);
  }
  sectionLines.push("");

  // ── External participants ──
  sectionLines.push("**External participants**");
  if (externalPools.length === 0) {
    sectionLines.push("- (none)");
  } else {
    for (const ep of externalPools) sectionLines.push(`- ${labelOf(ep)}`);
  }
  sectionLines.push("");

  // ── IT systems ──
  sectionLines.push("**IT systems involved**");
  if (systemPools.length === 0) {
    sectionLines.push("- (none)");
  } else {
    for (const sp of systemPools) sectionLines.push(`- ${labelOf(sp)}`);
  }
  sectionLines.push("");

  // ── Data objects and stores ──
  // Lists every data artifact with the tasks that read from / write to /
  // use it. Mirrors what's shown in-line on each task, but gives the user
  // a per-data-element view too — useful when the same data store is
  // touched by many tasks across lanes.
  const dataElements = elements.filter((e) => DATA_TYPES.has(e.type));
  sectionLines.push("**Data objects and stores**");
  if (dataElements.length === 0) {
    sectionLines.push("- (none)");
  } else {
    // Build reverse index: dataId → [{ task, direction }]
    const refsByData = new Map<string, Array<{ task: DiagramElement; direction: DataTouch["direction"] }>>();
    for (const [taskId, touches] of dataTouching) {
      const taskEl = byId.get(taskId);
      if (!taskEl) continue;
      for (const t of touches) {
        const arr = refsByData.get(t.peer.id) ?? [];
        arr.push({ task: taskEl, direction: t.direction });
        refsByData.set(t.peer.id, arr);
      }
    }
    for (const de of dataElements) {
      const kind = de.type === "data-store" ? "data store" : "data object";
      sectionLines.push(`- ${labelOf(de)} (${kind})`);
      const refs = refsByData.get(de.id) ?? [];
      if (refs.length === 0) {
        sectionLines.push(`  - (not referenced by any task)`);
      } else {
        for (const r of refs) {
          sectionLines.push(`  - ${cap(r.direction)} by ${labelOf(r.task)}`);
        }
      }
    }
  }
  sectionLines.push("");

  // ── Pools and Lanes (explicit structure — Greg's point 6) ──
  sectionLines.push("**Pools and Lanes**");
  const childLanesOf = (parentId: string) =>
    elements.filter((e) => e.type === "lane" && e.parentId === parentId).sort((a, b) => a.y - b.y);
  for (const pool of pools) {
    const ptype = (pool.properties?.poolType as string | undefined) ?? "white-box";
    const isSys = !!pool.properties?.isSystem;
    const tag = ptype === "white-box"
      ? "(main / white-box)"
      : (isSys ? "(IT system / black-box)" : "(external / black-box)");
    sectionLines.push(`- Pool: ${labelOf(pool)} ${tag}`);
    const lanes = childLanesOf(pool.id);
    for (const lane of lanes) {
      sectionLines.push(`  - Lane: ${labelOf(lane)}`);
      const subs = childLanesOf(lane.id);
      for (const sl of subs) sectionLines.push(`    - Sublane: ${labelOf(sl)}`);
    }
  }

  return sectionLines.join("\n").trimEnd();
}

function cap(s: string): string {
  if (!s) return s;
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Reverse-engineer a Context Diagram into a 4-section structured prompt:
 *   1. Processes (process-system) and their names — usually one
 *   2. Entities (external-entity) and their names
 *   3. Layout — entities placed relative to each process
 *   4. Flow connectors with directions and labels
 */
export function buildContextPrompt(
  elements: DiagramElement[],
  connectors: Connector[],
): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const labelOf = (e: DiagramElement | undefined): string =>
    e ? (e.label?.trim() || `<unnamed ${e.type}>`) : "<missing>";

  const processes = elements
    .filter((e) => e.type === "process-system")
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const entities = elements
    .filter((e) => e.type === "external-entity")
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const lines: string[] = [];

  // ── 1. Processes ──
  lines.push("# 1. Processes");
  lines.push("");
  if (processes.length === 0) {
    lines.push("- (No central process — this diagram is missing the system being analysed.)");
  } else {
    for (const p of processes) lines.push(`- "${labelOf(p)}"`);
  }
  lines.push("");

  // ── 2. Entities ──
  lines.push("# 2. External Entities");
  lines.push("");
  if (entities.length === 0) {
    lines.push("- (No external entities.)");
  } else {
    for (const e of entities) lines.push(`- "${labelOf(e)}"`);
  }
  lines.push("");

  // ── 3. Layout (entity → process relative position) ──
  lines.push("# 3. Layout (entities relative to processes)");
  lines.push("");
  if (processes.length === 0 || entities.length === 0) {
    lines.push("- (Layout not described — needs at least one process and one entity.)");
  } else {
    for (const ent of entities) {
      const rels: string[] = [];
      for (const proc of processes) {
        const dirs = relativeDirection(ent, proc);
        rels.push(`${dirs} "${labelOf(proc)}"`);
      }
      lines.push(`- "${labelOf(ent)}" is ${rels.join("; and ")}.`);
    }
  }
  lines.push("");

  // ── 4. Flow connectors ──
  lines.push("# 4. Flow Connectors");
  lines.push("");
  if (connectors.length === 0) {
    lines.push("- No connectors.");
  } else {
    for (const c of connectors) {
      const src = byId.get(c.sourceId);
      const tgt = byId.get(c.targetId);
      const arrow = arrowFor(c.directionType);
      const lbl = c.label?.trim();
      lines.push(
        `- "${labelOf(src)}" ${arrow} "${labelOf(tgt)}"${lbl ? ` (label: "${lbl}")` : ""}`,
      );
    }
  }

  return lines.join("\n").trimEnd();
}

function relativeDirection(a: DiagramElement, b: DiagramElement): string {
  const dirs: string[] = [];
  if (a.x + a.width <= b.x) dirs.push("left of");
  else if (b.x + b.width <= a.x) dirs.push("right of");
  if (a.y + a.height <= b.y) dirs.push("above");
  else if (b.y + b.height <= a.y) dirs.push("below");
  if (dirs.length === 0) return "overlapping";
  return dirs.join(" and ");
}

function arrowFor(d: string | undefined): string {
  switch (d) {
    case "directed":
      return "→";
    case "open-directed":
      return "⇢";
    case "both":
      return "↔";
    case "non-directed":
    default:
      return "—";
  }
}

