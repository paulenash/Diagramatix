/**
 * Pre-run simulation readiness check. Scans a study's root diagram(s) + the team
 * library and reports the parameters that still need setting, so the user can be
 * shown a "complete the setup" dialog before a run instead of getting silent
 * defaults (or, before the forgiving-getProperty fix, a crash).
 *
 * Pure + data-only (no engine), so it's cheap to run on every Run click and easy
 * to unit-test. `error` = the run will produce misleading numbers until fixed;
 * `warn` = a default will be assumed (usually fine, but worth surfacing).
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

export type ReadinessSeverity = "error" | "warn";
export interface ReadinessIssue {
  severity: ReadinessSeverity;
  message: string;
  elementId?: string;
  elementLabel?: string;
}

interface TeamLite {
  name: string;
  capacity: number;
  /** Named people, when the team declares any. Absent/empty = a counted pool. */
  members?: { name?: string; skills?: string[] }[];
}

const nameOf = (e?: DiagramElement) => (e?.label?.trim().replace(/\s+/g, " ")) || e?.id || "(unnamed)";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sim = (e: DiagramElement): any => (e.properties?.sim ?? {});

/** Property names referenced by getProperty('X') in an expression string. */
function propsUsedIn(expr: string): string[] {
  const out: string[] = [];
  const re = /getProperty\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) out.push(m[1]);
  return out;
}

export function checkSimReadiness(diagrams: DiagramData[], teams: TeamLite[]): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const teamByName = new Map(teams.map((t) => [t.name, t]));

  // Every property that IS assigned/initialised anywhere across the study.
  const assignedProps = new Set<string>();
  for (const d of diagrams) for (const el of d.elements) {
    for (const a of (sim(el).assign as { property?: string }[] | undefined) ?? []) {
      if (a.property) assignedProps.add(a.property);
    }
  }

  // Throw channels declared anywhere in the study — a catch may synchronise with
  // a throw in a linked child diagram, so this is collected study-wide.
  const CHANNEL_TYPES = new Set(["message", "signal", "escalation", "conditional"]);
  const channelKey = (el: DiagramElement) => {
    const name = (sim(el).channel as string | undefined)?.trim() || el.label?.trim() || el.id;
    return `${el.eventType}:${name}`;
  };
  const isChannelCatch = (el: DiagramElement) =>
    el.type === "intermediate-event" && !el.boundaryHostId && !!el.eventType && CHANNEL_TYPES.has(el.eventType) && el.flowType !== "throwing";
  const throwChannels = new Set<string>();
  for (const d of diagrams) for (const el of d.elements) {
    if (el.type === "intermediate-event" && !el.boundaryHostId && el.eventType && CHANNEL_TYPES.has(el.eventType) && el.flowType === "throwing") {
      throwChannels.add(channelKey(el));
    }
  }

  for (const d of diagrams) {
    const byId = new Map(d.elements.map((e) => [e.id, e]));
    const teamAncestor = (el: DiagramElement): string | undefined => {
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 32 && cur; i++) {
        const tid = sim(cur).teamId as string | undefined;
        if (tid) return tid;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return undefined;
    };

    // 1. Properties read but never initialised anywhere.
    const firstUse = new Map<string, DiagramElement>();
    const noteUse = (expr: string | undefined, el: DiagramElement) => {
      for (const p of propsUsedIn(expr ?? "")) if (!firstUse.has(p)) firstUse.set(p, el);
    };
    for (const el of d.elements) {
      for (const a of (sim(el).assign as { expr?: string }[] | undefined) ?? []) noteUse(a.expr, el);
    }
    for (const c of d.connectors) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cond = (c as any).branchCondition as string | undefined;
      if (cond) noteUse(cond, byId.get(c.sourceId) ?? el0(d));
    }
    for (const [p, el] of firstUse) {
      if (!assignedProps.has(p)) {
        issues.push({ severity: "error", elementId: el.id, elementLabel: nameOf(el),
          message: `Property "${p}" is used but never initialised — it will read 0. Add an assignment (e.g. on a start event) to give it a real value.` });
      }
    }

    // 2. Tasks: team assignment.
    for (const el of d.elements) {
      if (el.type !== "task" && el.type !== "subprocess") continue;
      const tid = teamAncestor(el);
      if (!tid) {
        issues.push({ severity: "warn", elementId: el.id, elementLabel: nameOf(el),
          message: `Task "${nameOf(el)}" has no team — it runs with unlimited capacity (no queueing / utilisation).` });
      } else if (!teamByName.has(tid)) {
        issues.push({ severity: "error", elementId: el.id, elementLabel: nameOf(el),
          message: `Task "${nameOf(el)}" uses team "${tid}", which isn't in the team library — add it and set a capacity.` });
      } else {
        // A skill requirement on a team that names NOBODY is silently granted to
        // anyone: ResourcePool short-circuits on `if (!this.skilled)`, which is
        // the right call for backwards compatibility (a model that predates
        // skills must run exactly as it did) and the wrong one for authoring —
        // the restriction is in the diagram, the run ignores it, and nothing
        // says so. Reported as an ERROR because the numbers are wrong in the
        // flattering direction: no queue where there should be one.
        const need = (sim(el).requiredSkills as string[] | undefined) ?? [];
        const team = teamByName.get(tid)!;
        const people = (team.members ?? []).filter((m) => m?.name?.trim());
        if (need.length > 0 && people.length === 0) {
          issues.push({ severity: "error", elementId: el.id, elementLabel: nameOf(el),
            message: `Task "${nameOf(el)}" requires ${need.map((s) => `"${s}"`).join(" + ")}, but team "${tid}" names no people — the requirement is IGNORED and anyone on the team can take it. Name the team's members, or clear the requirement.` });
        } else if (need.length > 0) {
          // Named people, but nobody who qualifies: the opposite failure, and a
          // deadlock rather than a silent no-op — the work waits forever.
          const holders = people.filter((m) => need.every((sk) => (m.skills ?? []).includes(sk)));
          if (holders.length === 0) {
            issues.push({ severity: "error", elementId: el.id, elementLabel: nameOf(el),
              message: `Task "${nameOf(el)}" requires ${need.map((s) => `"${s}"`).join(" + ")}, but nobody on team "${tid}" holds ${need.length > 1 ? "all of those" : "it"} — this work can never start.` });
          }
        }
      }
    }

    // 3. Decision gateways: branch routing.
    // Describe the gateway by its neighbours (source → targets) so an UNLABELLED
    // one (common in discovered/AI processes — it shows only a cryptic id) is
    // still identifiable on the diagram.
    const describe = (e?: DiagramElement) => !e ? "?" : e.type === "end-event" ? "End" : e.type === "start-event" ? "Start" : nameOf(e);
    for (const el of d.elements) {
      if (el.type !== "gateway" || (el.properties?.gatewayRole as string | undefined) === "merge") continue;
      // Parallel (AND) gateways fire EVERY outgoing branch — probabilities /
      // conditions don't apply, so a parallel split is never an under-specified
      // "decision". Only exclusive / inclusive splits route by probability.
      if (el.gatewayType === "parallel") continue;
      const outs = d.connectors.filter((c) => c.type === "sequence" && c.sourceId === el.id);
      if (outs.length < 2) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routed = outs.some((c: any) => c.branchProbability != null || c.branchCondition || c.isDefaultFlow);
      if (!routed) {
        const rawName = el.label?.trim();
        const from = d.connectors.find((c) => c.type === "sequence" && c.targetId === el.id);
        const fromLbl = from ? describe(byId.get(from.sourceId)) : null;
        const toLbls = [...new Set(outs.map((c) => describe(byId.get(c.targetId))))];
        const which = rawName ? `"${rawName}"` : fromLbl ? `after "${fromLbl}"` : "(unnamed)";
        issues.push({ severity: "warn", elementId: el.id, elementLabel: rawName || fromLbl || el.id,
          message: `Decision ${which} (→ ${toLbls.join(" / ")}) has ${outs.length} branches with no probabilities or conditions — they'll be split evenly.` });
      }
    }

    // 4. Process source events: arrival.
    for (const el of d.elements) {
      if (el.type !== "start-event" || el.boundaryHostId) continue;
      const parent = el.parentId ? byId.get(el.parentId) : undefined;
      const isProcessSource = !parent || parent.type === "pool" || parent.type === "lane";
      if (isProcessSource && !sim(el).arrival) {
        issues.push({ severity: "warn", elementId: el.id, elementLabel: nameOf(el),
          message: `Start event "${nameOf(el)}" has no arrival rate — a default inter-arrival time is assumed.` });
      }
    }

    // 6. Catch events with nothing to release them act as a pass-through.
    for (const el of d.elements) {
      if (!isChannelCatch(el)) continue;
      if (!throwChannels.has(channelKey(el)) && !sim(el).catchTimeout) {
        issues.push({ severity: "warn", elementId: el.id, elementLabel: nameOf(el),
          message: `Catch event "${nameOf(el)}" has no matching throw and no timeout — it passes straight through instead of waiting. Add a throwing ${el.eventType} with the same name, or set a timeout / external-arrival time, to make it synchronise.` });
      }
    }

    // 7. Boundary events on activities: missing trigger time.
    for (const el of d.elements) {
      if (el.type !== "intermediate-event" || !el.boundaryHostId || el.eventType === "compensation") continue;
      const host = byId.get(el.boundaryHostId);
      if (host && !sim(el).boundary?.trigger) {
        const what = host.type === "subprocess-expanded" ? "the whole subprocess" : "the host's cycle time";
        issues.push({ severity: "warn", elementId: el.id, elementLabel: nameOf(el),
          message: `Boundary event "${nameOf(el)}" has no trigger time — a default is assumed (it races ${what}).` });
      }
    }
  }

  // 5. Teams with no capacity.
  for (const t of teams) {
    if (!(t.capacity > 0)) {
      issues.push({ severity: "error", message: `Team "${t.name}" has capacity 0 — set a capacity or all its work will block.` });
    }
  }

  return issues;
}

const el0 = (d: DiagramData) => d.elements[0];
