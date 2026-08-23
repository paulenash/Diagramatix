/**
 * Assemble a single BPMN diagram into the engine's SimNetwork — now hierarchy-
 * aware so a drawn Expanded Subprocess (EP) simulates its inline body, and an
 * Event Subprocess nested inside an EP becomes an engine event sub.
 *
 * Mapping:
 *  • An Expanded Subprocess (`subprocess-expanded`, not an event sub) → a
 *    `subprocess` node; its child start-event is the body entry (a pass-through
 *    delay), its body children are scope-tagged, its child end-events become
 *    scope sinks; repeatType / sim.loop → LoopSpec.
 *  • An Event Subprocess (`subprocess-expanded` + properties.subprocessType ===
 *    "event") inside an EP → an `eventSub` on that parent EP: the internal
 *    start-event gives the trigger (sim.eventTrigger) + interrupting flag
 *    (properties.interruptionType !== "non-interrupting"); its first downstream
 *    node is the handler bodyStart.
 *  • Everything else maps flatly as before.
 *
 * Decision routing comes off the connectors; distinct team ids → resource pools.
 * The portfolio assembler (network.ts, Phase 4) extends this across linked
 * diagrams via walkForwardClosure.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, type LoopParams } from "@/app/lib/diagram/simParams";
import type { SimNetwork, SimNode, SimEdge, SimTeam, NodeKind, Assignment, LoopSpec, EventSub, BoundaryEvent, EventChannel } from "./model";
import type { SimDist, WorkCalendar } from "./types";

/** Resolvers for working calendars: team calendars keyed by team name (like
 *  teamCapacities), and a lookup from a source's calendarId → its WorkCalendar. */
export interface CalendarOpts {
  teamCalendars?: Record<string, WorkCalendar>;
  calendarsById?: Record<string, WorkCalendar>;
}

/**
 * Resource lookup that tolerates the drift a NAME-matched link inevitably
 * collects — case and surrounding whitespace. "sales team" and "Sales Team " are
 * the same resource; treating them as different silently produced a second,
 * one-person pool that no capacity setting could reach.
 */
function resourceIndex<T>(map: Record<string, T> | undefined): Map<string, { key: string; value: T }> {
  const out = new Map<string, { key: string; value: T }>();
  for (const [k, v] of Object.entries(map ?? {})) out.set(k.trim().toLowerCase(), { key: k, value: v });
  return out;
}

export interface AssembleOpts extends CalendarOpts {
  /** Resource name → capacity, from the project's Resources library. */
  teamCapacities?: Record<string, number>;
  /** Deny a pool to any resource the library does not declare, so only visible,
   *  adjustable resources can affect a run. The app sets this; tests and the
   *  BPSim interchange keep the permissive behaviour. */
  strictTeams?: boolean;
}

const DEFAULT_ARRIVAL: SimDist = { kind: "exponential", mean: 10 };
const DEFAULT_CYCLE: SimDist = { kind: "fixed", value: 1 };
const DEFAULT_TRIGGER: SimDist = { kind: "exponential", mean: 60 };

function baseKind(type: string): NodeKind | null {
  switch (type) {
    case "start-event": return "source";
    case "end-event": return "sink";
    case "task":
    case "subprocess": return "task"; // collapsed subprocess → black-box task (summary)
    case "subprocess-expanded": return "subprocess";
    case "gateway": return "gateway";
    case "intermediate-event": return "delay";
    default: return null;
  }
}

const isEP = (el?: DiagramElement) => !!el && el.type === "subprocess-expanded";
const isEventEP = (el?: DiagramElement) => isEP(el) && el!.properties?.subprocessType === "event";

/** Inline intermediate event types that participate in throw→catch
 *  synchronisation. Message correlates 1:1 (buffered); the rest broadcast. */
const CHANNEL_TYPES = new Set(["message", "signal", "escalation", "conditional"]);
function channelOf(el: DiagramElement): EventChannel | undefined {
  const et = el.eventType;
  if (!et || !CHANNEL_TYPES.has(et)) return undefined;
  // Channel is keyed by type + name so a signal never releases a message catch.
  const name = getSimParams(el).channel?.trim() || el.label?.trim() || el.id;
  return { channel: `${et}:${name}`, correlation: et === "message" ? "message" : "signal" };
}

/** Map a diagram LoopParams (+ repeatType fallback) to the engine LoopSpec. */
function loopOf(el: DiagramElement): LoopSpec | undefined {
  const lp: LoopParams | undefined = getSimParams(el).loop;
  if (lp) {
    return lp.kind === "standard"
      ? { kind: "standard", iterations: lp.iterations, loopBackProb: lp.loopBackProb }
      : { kind: "multi", instances: lp.instances, ordering: lp.ordering };
  }
  switch (el.repeatType) {
    case "loop": return { kind: "standard", iterations: { kind: "fixed", value: 2 } };
    case "mi-sequential": return { kind: "multi", instances: { kind: "fixed", value: 3 }, ordering: "sequential" };
    case "mi-parallel": return { kind: "multi", instances: { kind: "fixed", value: 3 }, ordering: "parallel" };
    default: return undefined;
  }
}

export function assembleFromDiagram(
  data: DiagramData,
  opts?: AssembleOpts,
): SimNetwork {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const childrenOf = new Map<string, DiagramElement[]>();
  for (const e of data.elements) {
    if (e.parentId) (childrenOf.get(e.parentId) ?? childrenOf.set(e.parentId, []).get(e.parentId)!).push(e);
  }
  const firstOutTarget = (id: string) => data.connectors.find((c) => c.sourceId === id)?.targetId;
  /** The outgoing connector itself, so a diverted token can record the edge it travelled. */
  const firstOutEdge = (id: string) => data.connectors.find((c) => c.sourceId === id)?.id;
  /** Nearest ancestor lane/pool team — a task with no own team inherits it. */
  const laneTeamOf = (el: DiagramElement): string | undefined => {
    let cur = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "lane" || cur.type === "pool") {
        const tid = getSimParams(cur).teamId;
        if (tid) return tid;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  /** The team NAME for an element by its nearest lane/pool LABEL (how teams are
   *  named + how teamCalendars is keyed), for elements that carry no own teamId. */
  const laneLabelTeamOf = (el: DiagramElement): string | undefined => {
    let cur = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "lane" || cur.type === "pool") return (cur.label || "").trim() || undefined;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  /** Nearest ancestor EP — the scope a body node belongs to. */
  const scopeOf = (el: DiagramElement): string | undefined => {
    let cur = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (isEP(cur)) return cur.id;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };

  // ── Compensation wiring (BPMN) ──
  // A boundary CATCHING compensation event is not a flow node — it's skipped —
  // and its outgoing association names the host activity's compensation handler.
  // The host → handler-ids map arms the engine; an inline THROWING compensation
  // event (tagged below) fires the armed handlers. Association / message links
  // are excluded from the control-flow graph entirely (see the edge filter).
  const compHandlersByHost = new Map<string, string[]>();
  const isCompEvent = (el: DiagramElement) =>
    el.type === "intermediate-event" && el.eventType === "compensation";
  const isBoundaryCompCatch = (el: DiagramElement) =>
    isCompEvent(el) && !!el.boundaryHostId && el.flowType !== "throwing";
  const isInlineCompThrow = (el: DiagramElement) =>
    isCompEvent(el) && !el.boundaryHostId && el.flowType === "throwing";

  // ── Event subprocesses: build EventSub records, skip their start events ──
  const skip = new Set<string>();          // elements that aren't flow nodes
  for (const el of data.elements) {
    if (!isBoundaryCompCatch(el)) continue;
    skip.add(el.id); // boundary compensation catch event is not a flow node
    const handlers = data.connectors
      .filter((c) => c.sourceId === el.id) // its (association) links to the handler activity
      .map((c) => c.targetId);
    if (handlers.length) {
      const arr = compHandlersByHost.get(el.boundaryHostId!) ?? compHandlersByHost.set(el.boundaryHostId!, []).get(el.boundaryHostId!)!;
      arr.push(...handlers);
    }
  }
  const eventSubsByParent = new Map<string, EventSub[]>();
  for (const el of data.elements) {
    if (!isEventEP(el)) continue;
    const parentScope = scopeOf(el);
    const startEv = (childrenOf.get(el.id) ?? []).find((c) => c.type === "start-event");
    skip.add(el.id);
    if (startEv) skip.add(startEv.id);
    if (!parentScope || !startEv) continue; // event sub must live inside an EP
    const bodyStart = firstOutTarget(startEv.id);
    if (!bodyStart) continue;
    const trigger = getSimParams(startEv).eventTrigger ?? getSimParams(el).eventTrigger ?? DEFAULT_TRIGGER;
    const interrupting = startEv.properties?.interruptionType !== "non-interrupting";
    const arr = eventSubsByParent.get(parentScope) ?? eventSubsByParent.set(parentScope, []).get(parentScope)!;
    arr.push({ id: el.id, bodyStart, viaEdge: firstOutEdge(startEv.id), trigger, interrupting });
  }

  // ── Boundary catch events on activities ──
  // A boundary event is not a flow node; it's armed while its host runs and races
  // the host's duration (see engine). On a task / collapsed subprocess the race
  // is against the cycle time (armed at service start); on an Expanded Subprocess
  // it's against the whole inline body (armed at scope entry, like an event sub).
  // Compensation boundary events keep their own handling above and are excluded.
  const boundaryByHost = new Map<string, BoundaryEvent[]>();
  const isBoundaryCatch = (el: DiagramElement) =>
    el.type === "intermediate-event" && !!el.boundaryHostId && el.eventType !== "compensation";
  const RACEABLE_HOSTS = new Set(["task", "subprocess", "subprocess-expanded"]);
  for (const el of data.elements) {
    if (!isBoundaryCatch(el)) continue;
    skip.add(el.id); // reached only via the race, never by sequence flow
    const host = byId.get(el.boundaryHostId!);
    if (!host || !RACEABLE_HOSTS.has(host.type) || isEventEP(host)) continue;
    const bodyStart = firstOutTarget(el.id);
    if (!bodyStart) continue; // no handler flow → nothing to divert to
    const bp = getSimParams(el).boundary;
    const be: BoundaryEvent = {
      id: el.id,
      bodyStart,
      viaEdge: firstOutEdge(el.id),
      trigger: bp?.trigger ?? DEFAULT_TRIGGER,
      fireProb: bp?.fireProb ?? 1,
      interrupting: el.properties?.interruptionType !== "non-interrupting",
    };
    // "7 working days" is not 7 elapsed days — a reminder timer that ignores
    // nights and weekends fires while nobody could have acted. Working hours
    // come from the HOST's team: the reminder is chased by whoever owns the
    // step. Absent → elapsed, which is what an unqualified "2 days" means.
    if (bp?.triggerMode === "working") {
      const hostTeam = getSimParams(host).teamId ?? laneLabelTeamOf(host);
      const cal = hostTeam ? opts?.teamCalendars?.[hostTeam] : undefined;
      if (cal) { be.triggerMode = "working"; be.calendar = cal; }
    }
    (boundaryByHost.get(el.boundaryHostId!) ?? boundaryByHost.set(el.boundaryHostId!, []).get(el.boundaryHostId!)!).push(be);
  }

  // Throw channels present in THIS diagram — a catch only blocks if something can
  // release it (a matching throw here, or a timeout); otherwise it stays a plain
  // pass-through delay so a bare message/signal event never deadlocks the run.
  const throwChannels = new Set<string>();
  for (const el of data.elements) {
    if (el.type === "intermediate-event" && !el.boundaryHostId && el.flowType === "throwing") {
      const ch = channelOf(el);
      if (ch) throwChannels.add(ch.channel);
    }
  }

  // ── Map elements to engine nodes ──
  const nodes: SimNode[] = [];
  const teamIds = new Set<string>();

  for (const el of data.elements) {
    if (skip.has(el.id)) continue;
    let kind = baseKind(el.type);
    if (!kind) continue;
    if (isEventEP(el)) continue; // handled as an event sub
    const sim = getSimParams(el);
    const scope = scopeOf(el);
    const node: SimNode = { id: el.id, kind, label: el.label, scope };

    if (kind === "source") {
      if (scope !== undefined) { node.kind = "delay"; node.delay = { kind: "fixed", value: 0 }; kind = "delay"; } // EP body entry → pass-through
      else {
        node.arrival = sim.arrival ?? DEFAULT_ARRIVAL;
        node.maxArrivals = sim.maxArrivals;
        const cal = sim.calendarId ? opts?.calendarsById?.[sim.calendarId] : undefined;
        if (cal) node.calendar = cal; // operating hours for this arrival source
      }
    } else if (kind === "task") {
      node.cycleTime = sim.cycleTime ?? DEFAULT_CYCLE;
      node.setupTime = sim.setupTime;
      node.waitTime = sim.waitTime;
      const teamId = sim.teamId ?? laneTeamOf(el); // inherit the lane's team if none set
      node.teamId = teamId;
      node.units = sim.resourceUnits ?? 1;
      if (teamId) teamIds.add(teamId);
      // A repeat / multi-instance marker on a TASK means the work is performed
      // more than once. This used to be read only for sub-processes, so the
      // marker on a task was drawn and exported but silently ignored by the run,
      // understating that task's load and every queue behind it.
      node.loop = loopOf(el);
    } else if (kind === "delay") {
      node.delay = sim.delay ?? { kind: "fixed", value: 0 };
      // Timer-delay semantics from the label parse (autofill) or explicit params:
      //   "until"   → wait to a wall-clock time (delay ignored)
      //   "working" → count `delay` only during working hours; the calendar is
      //               the timer's own (calendarId) or its lane team's calendar.
      if (sim.delayMode === "until" && sim.delayUntil) {
        node.delayMode = "until";
        node.delayUntil = sim.delayUntil;
      } else if (sim.delayMode === "working") {
        node.delayMode = "working";
        // Working hours = the timer's own calendar (calendarId) or its lane
        // team's. teamCalendars is keyed by team NAME (the lane label), so
        // resolve the team the same way autofill does — by the lane's label.
        const teamName = sim.teamId ?? laneLabelTeamOf(el);
        const teamCal = teamName ? opts?.teamCalendars?.[teamName] : undefined;
        const cal = (sim.calendarId ? opts?.calendarsById?.[sim.calendarId] : undefined) ?? teamCal;
        if (cal) node.calendar = cal;
      }
      if (isInlineCompThrow(el)) {
        node.compensationThrow = true; // fires armed handlers on entry
      } else {
        // Message/signal/escalation/conditional intermediate event → a THROW
        // (fires its channel on entry) or a CATCH (blocks until the channel
        // fires; catchTimeout is the fallback / external-arrival release).
        const chan = channelOf(el);
        if (chan) {
          if (el.flowType === "throwing") {
            node.throw = chan;
          } else {
            // Only BLOCK when the catch can be released — a matching throw is in
            // this diagram, or a timeout is set. Otherwise it stays a plain
            // pass-through delay (backward-compatible; readiness flags it).
            const to = getSimParams(el).catchTimeout;
            if (to || throwChannels.has(chan.channel)) {
              node.catch = chan;
              if (to) node.catchTimeout = to;
            }
          }
        }
      }
    } else if (kind === "gateway") {
      // Event-based stays a decision (the race has exactly one winner) and so
      // does complex (we don't model its expression) — both are exclusive
      // approximations. Inclusive is genuinely different and gets its own kind.
      node.gateway = el.gatewayType === "parallel" ? "parallel"
        : el.gatewayType === "inclusive" ? "inclusive"
        : "decision";
    } else if (kind === "subprocess") {
      // Body start = a start-event whose owning subprocess IS this one. Search the
      // whole subtree (not just direct children): a linked diagram spliced in
      // keeps its pools/lanes, so its start-event is nested inside them rather
      // than a direct child. scopeOf excludes start-events in NESTED subprocesses.
      const bodyStartEl = data.elements.find((c) => c.type === "start-event" && !skip.has(c.id) && scopeOf(c) === el.id)
        ?? (childrenOf.get(el.id) ?? []).find((c) => c.type === "start-event" && !skip.has(c.id));
      node.bodyStart = bodyStartEl?.id;
      node.loop = loopOf(el);
      node.eventSubs = eventSubsByParent.get(el.id);
    }

    if (sim.assign && sim.assign.length > 0) {
      node.assign = sim.assign.map<Assignment>((a) => ({
        property: a.property,
        value: a.expr ? { expr: a.expr } : (a.dist ?? { kind: "fixed", value: 0 }),
      }));
    }
    // Host activity → its armed compensation handler(s).
    const ch = compHandlersByHost.get(el.id);
    if (ch && ch.length) node.compensationHandlers = ch;
    // Boundary catch events mounted on this activity (raced while in service).
    const bes = boundaryByHost.get(el.id);
    if (bes && bes.length) node.boundaryEvents = bes;
    nodes.push(node);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  // Prune compensation handler ids to those that are real sim nodes.
  for (const n of nodes) {
    if (!n.compensationHandlers) continue;
    n.compensationHandlers = n.compensationHandlers.filter((id) => nodeIds.has(id));
    if (n.compensationHandlers.length === 0) delete n.compensationHandlers;
  }
  // Prune boundary events whose diverted target isn't a real sim node.
  for (const n of nodes) {
    if (!n.boundaryEvents) continue;
    n.boundaryEvents = n.boundaryEvents.filter((b) => nodeIds.has(b.bodyStart));
    if (n.boundaryEvents.length === 0) delete n.boundaryEvents;
  }
  // Only CONTROL-FLOW connectors form the executable graph. Associations (incl.
  // the compensation association) and message flows are NOT control flow — the
  // engine walks sequence flow only; compensation handlers are dispatched
  // separately. Exclude by type (undefined type = legacy sequence → kept).
  const NON_FLOW = new Set(["associationBPMN", "association", "messageBPMN", "message"]);
  const edges: SimEdge[] = data.connectors
    .filter((c) => !NON_FLOW.has(c.type) && nodeIds.has(c.sourceId) && nodeIds.has(c.targetId))
    .map((c) => ({
      id: c.id,
      source: c.sourceId,
      target: c.targetId,
      probability: c.branchProbability !== undefined ? c.branchProbability / 100 : undefined,
      condition: c.branchCondition ? { expr: c.branchCondition } : undefined,
      isDefault: c.isDefaultFlow,
    }));

  // ── Resources: only what the library actually declares ────────────────────
  // A pool used to be created for ANY string an activity named, defaulting to
  // capacity 1 — so a stale or mistyped name became an invisible one-person team
  // that no setting could reach, and the run reported plausible, wrong numbers.
  // Names are matched ignoring case and surrounding whitespace; anything the
  // library does not declare is reported, and under `strictTeams` is denied a
  // pool entirely so it cannot influence the run at all.
  const capIndex = resourceIndex(opts?.teamCapacities);
  const calIndex = resourceIndex(opts?.teamCalendars);
  // An EMPTY capacity map means the library isn't available — almost always
  // "not loaded yet" rather than "this project has no resources". Applying the
  // strict rule then would declare EVERY resource unknown and strip the lot,
  // showing a run with no contention at all. Degrade to the permissive path
  // instead: wrong-but-familiar beats confidently-empty. The console also gates
  // on load, so this is the second line of defence, not the first.
  const haveLibrary = capIndex.size > 0;
  const unknownTeams: string[] = [];
  const teams = new Map<string, SimTeam>();
  // Task spelling → the library's canonical name. Matching is deliberately
  // fuzzy (case + surrounding whitespace) but the RESULT never is: every pool is
  // created under the library's own name, and each activity is rewritten to it.
  // Keeping the activity's variant would leave a second pool under a name that
  // appears nowhere in the Resources list — a hidden version of the same team,
  // splitting its capacity and its utilisation in two.
  const canonical = new Map<string, string>();
  for (const id of teamIds) {
    const hit = capIndex.get(id.trim().toLowerCase());
    if (!hit) {
      if (haveLibrary) {
        unknownTeams.push(id);
        if (opts?.strictTeams) continue; // no pool — the run cannot use it
      }
      canonical.set(id, id);
      const cal = calIndex.get(id.trim().toLowerCase())?.value;
      if (!teams.has(id)) teams.set(id, { id, capacity: 1, ...(cal ? { calendar: cal } : {}) });
      continue;
    }
    canonical.set(id, hit.key);
    if (!teams.has(hit.key)) {
      const cal = calIndex.get(hit.key.trim().toLowerCase())?.value;
      teams.set(hit.key, { id: hit.key, capacity: hit.value, ...(cal ? { calendar: cal } : {}) });
    }
  }
  // Point every activity at the canonical resource — or at nothing when strict
  // mode denied it a pool, so it cannot queue on a team that does not exist.
  for (const n of nodes) {
    if (!n.teamId) continue;
    const target = canonical.get(n.teamId);
    if (target) n.teamId = target;
    else if (opts?.strictTeams) delete n.teamId;
  }

  return { nodes, edges, teams: [...teams.values()], ...(unknownTeams.length ? { unknownTeams } : {}) };
}
