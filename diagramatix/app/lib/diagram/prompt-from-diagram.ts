import type { Connector, DiagramElement, DiagramType } from "./types";

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
  return buildBpmnPrompt(elements, connectors);
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

  // Walk parentId chain to find the containing lane (null = direct in pool).
  function laneOf(el: DiagramElement | undefined): DiagramElement | null {
    let cur = el;
    let guard = 0;
    while (cur && guard++ < 16) {
      const p = cur.parentId ? byId.get(cur.parentId) : undefined;
      if (!p) return null;
      if (p.type === "lane") return p;
      if (p.type === "pool") return null;
      cur = p;
    }
    return null;
  }
  function poolOf(el: DiagramElement | undefined): DiagramElement | null {
    let cur = el;
    let guard = 0;
    while (cur && guard++ < 16) {
      if (cur.type === "pool") return cur;
      const p = cur.parentId ? byId.get(cur.parentId) : undefined;
      if (!p) return null;
      cur = p;
    }
    return null;
  }

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
      return { line: `${pad}- **${labelOf(el)}** (subprocess — see steps below)`, descendIntoSub: el };
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

  function walk(seedId: string, indent: number, lastLaneId?: string) {
    let curId: string | undefined = seedId;
    let lastLane = lastLaneId;
    while (curId && !renderedNodes.has(curId)) {
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

      // End event terminates the walk on this branch.
      if (el.type === "end-event") break;

      // Diverging gateway: emit "On <flow label>:" sub-heading per branch
      // and recursively walk each one. Visited tracking via renderedNodes
      // naturally stops duplicate descriptions at the merge point. If a
      // branch has nothing new to say (e.g. it converges immediately into
      // a path already described) the sub-heading is replaced with a
      // "merges back" note so the user isn't left staring at an empty bullet.
      if (el.type === "gateway") {
        const outConns: Connector[] = outgoing.get(curId) ?? [];
        if (outConns.length > 1) {
          const pad = "  ".repeat(indent + 1);
          for (const c of outConns) {
            const flowLabel = c.label?.trim() || "(unlabelled branch)";
            const before = narrativeLines.length;
            const headerIdx = narrativeLines.push(`${pad}- On **${flowLabel}**:`) - 1;
            walk(c.targetId, indent + 2, lastLane);
            if (narrativeLines.length === before + 1) {
              // Walk added nothing — the target was already covered.
              narrativeLines[headerIdx] = `${pad}- On **${flowLabel}**: (merges back into the path above)`;
            }
          }
        } else if (outConns.length === 1) {
          curId = outConns[0].targetId;
          continue;
        }
        break;
      }

      const outConns: Connector[] = outgoing.get(curId) ?? [];
      curId = outConns[0]?.targetId;
    }
  }

  function isInside(child: DiagramElement, ancestorId: string): boolean {
    let cur: DiagramElement | undefined = child;
    let g = 0;
    while (cur && g++ < 16) {
      if (cur.parentId === ancestorId) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
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

