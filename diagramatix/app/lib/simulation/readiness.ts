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

interface TeamLite { name: string; capacity: number }

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
      }
    }

    // 3. Decision gateways: branch routing.
    for (const el of d.elements) {
      if (el.type !== "gateway" || (el.properties?.gatewayRole as string | undefined) === "merge") continue;
      const outs = d.connectors.filter((c) => c.type === "sequence" && c.sourceId === el.id);
      if (outs.length < 2) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routed = outs.some((c: any) => c.branchProbability != null || c.branchCondition || c.isDefaultFlow);
      if (!routed) {
        issues.push({ severity: "warn", elementId: el.id, elementLabel: nameOf(el),
          message: `Decision "${nameOf(el)}" has ${outs.length} branches with no probabilities or conditions — they'll be split evenly.` });
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
