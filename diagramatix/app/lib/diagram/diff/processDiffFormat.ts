/**
 * Presentation formatters for a ProcessDiff — a Markdown document (rendered to
 * .docx via buildDocx, tables and all) and a flat CSV. Kept separate from the
 * pure diff engine so the engine has no formatting concerns.
 */
import { eventTrigger as evTrig, type ProcessDiff, type ProcessDiffRow, type DiffStatus } from "./processDiff";

const STATUS_LABEL: Record<DiffStatus, string> = {
  added: "Added", removed: "Removed", changed: "Changed", unchanged: "Unchanged",
};

const list = (xs: string[]): string => (xs.length ? xs.join(", ") : "—");
const arrow = (a?: string, b?: string): string => {
  const A = a || "—", B = b || "—";
  return A === B ? A : `${A} → ${B}`;
};
const arrowList = (a: string[], b: string[]): string => {
  const A = list(a), B = list(b);
  return A === B ? A : `${A} → ${B}`;
};

/** Escape a Markdown table cell (pipes + newlines). */
const mdCell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");

/** A full Markdown report — summary paragraph, roles/systems deltas, and the
 *  activity comparison table. Feeds buildDocx for the .docx export. */
export function diffToMarkdown(diff: ProcessDiff): string {
  const { a, b, summary, roleDiff, systemDiff, rows } = diff;
  const out: string[] = [];
  out.push(`**Comparing:** ${a.title} (before) → ${b.title} (after)`);
  out.push("");
  out.push(
    `**Summary:** ${summary.added} added · ${summary.removed} removed · ` +
    `${summary.changed} changed · ${summary.unchanged} unchanged ` +
    `(${a.stepCount} activities → ${b.stepCount}).`,
  );
  out.push("");
  if (roleDiff.added.length || roleDiff.removed.length) {
    out.push(`**Roles:** ${roleDiff.added.length ? `added ${list(roleDiff.added)}` : ""}` +
      `${roleDiff.added.length && roleDiff.removed.length ? "; " : ""}` +
      `${roleDiff.removed.length ? `removed ${list(roleDiff.removed)}` : ""}`);
    out.push("");
  }
  if (systemDiff.added.length || systemDiff.removed.length) {
    out.push(`**Systems:** ${systemDiff.added.length ? `added ${list(systemDiff.added)}` : ""}` +
      `${systemDiff.added.length && systemDiff.removed.length ? "; " : ""}` +
      `${systemDiff.removed.length ? `removed ${list(systemDiff.removed)}` : ""}`);
    out.push("");
  }
  const objDiff = diff.dataObjectDiff;
  if (objDiff.added.length || objDiff.removed.length) {
    out.push(`**Data objects:** ${objDiff.added.length ? `added ${list(objDiff.added)}` : ""}` +
      `${objDiff.added.length && objDiff.removed.length ? "; " : ""}` +
      `${objDiff.removed.length ? `removed ${list(objDiff.removed)}` : ""}`);
    out.push("");
  }
  // Activities — the primary comparison table (first column "Activity").
  out.push("## Activities");
  out.push("");
  out.push("| Activity | Change | Who (role) | Type | Systems | Data |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    out.push("| " + [
      mdCell(r.activity),
      STATUS_LABEL[r.status],
      mdCell(arrow(r.who.a, r.who.b)),
      mdCell(arrow(r.taskType.a, r.taskType.b)),
      mdCell(arrowList(r.systems.a ?? [], r.systems.b ?? [])),
      mdCell(arrowList(r.data.a ?? [], r.data.b ?? [])),
    ].join(" | ") + " |");
  }

  // Review status — its own heading + table (first column "Change"), kept a
  // clearly separate section AFTER the activities table.
  const rd = diff.reviewDiff;
  const kindLabel: Record<string, string> = { "review-comment": "Review Comment", "pain-point": "Pain Point", issue: "Issue", bottleneck: "Bottleneck" };
  if (rd.added.length || rd.removed.length || Object.values(rd.aCounts).some((n) => n > 0) || Object.values(rd.bCounts).some((n) => n > 0)) {
    out.push("");
    out.push("## Review status");
    out.push("");
    out.push(rd.status);
    out.push("");
    if (rd.removed.length || rd.added.length) {
      out.push("| Change | Kind | Note | Near |");
      out.push("| --- | --- | --- | --- |");
      for (const r of rd.removed) out.push(`| Removed | ${kindLabel[r.kind]} | ${mdCell(r.text || "—")} | ${mdCell(r.location || "—")} |`);
      for (const r of rd.added) out.push(`| Added | ${kindLabel[r.kind]} | ${mdCell(r.text || "—")} | ${mdCell(r.location || "—")} |`);
      out.push("");
    }
  }

  // Message flows — added / removed / relabelled between the versions.
  const md = diff.messageDiff;
  if (md.added.length || md.removed.length || md.changed.length) {
    out.push("");
    out.push("## Message flows");
    out.push("");
    out.push("| Change | From | To | Message |");
    out.push("| --- | --- | --- | --- |");
    for (const m of md.removed) out.push(`| Removed | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(m.label || "—")} |`);
    for (const m of md.added) out.push(`| Added | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(m.label || "—")} |`);
    for (const m of md.changed) out.push(`| Changed | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(`${m.a || "—"} → ${m.b || "—"}`)} |`);
  }

  // Intermediate + boundary events.
  const ev = diff.eventDiff;
  if (ev.added.length || ev.removed.length || ev.changed.length) {
    out.push("");
    out.push("## Intermediate & boundary events");
    out.push("");
    out.push("| Change | Kind | Where | Trigger |");
    out.push("| --- | --- | --- | --- |");
    const kindLabel = (k: string) => (k === "boundary" ? "Boundary" : "Intermediate");
    const whereOf = (k: string, w: string) => (k === "boundary" ? `on ${w}` : (w || "(inline)"));
    for (const e of ev.removed) out.push(`| Removed | ${kindLabel(e.kind)} | ${mdCell(whereOf(e.kind, e.kind === "boundary" ? e.host : e.label))} | ${mdCell(evTrig(e))} |`);
    for (const e of ev.added) out.push(`| Added | ${kindLabel(e.kind)} | ${mdCell(whereOf(e.kind, e.kind === "boundary" ? e.host : e.label))} | ${mdCell(evTrig(e))} |`);
    for (const e of ev.changed) out.push(`| Changed | ${kindLabel(e.kind)} | ${mdCell(whereOf(e.kind, e.where))} | ${mdCell(`${e.a} → ${e.b}`)} |`);
  }

  // Automation changes — task-marker shifts and what they signal.
  if (diff.automationChanges.length) {
    out.push("");
    out.push("## Automation changes");
    out.push("");
    out.push("| Activity | Marker | What it signals |");
    out.push("| --- | --- | --- |");
    for (const c of diff.automationChanges) {
      out.push(`| ${mdCell(c.activity)} | ${mdCell(`${c.from} → ${c.to}`)} | ${mdCell(c.note)} |`);
    }
  }
  return out.join("\n");
}

const csvCell = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** Flat CSV: one row per activity, before/after columns per dimension. */
export function diffToCsv(diff: ProcessDiff): string {
  const head = [
    "Activity", "Change",
    `Who (${diff.a.title})`, `Who (${diff.b.title})`,
    `Type (${diff.a.title})`, `Type (${diff.b.title})`,
    `Systems (${diff.a.title})`, `Systems (${diff.b.title})`,
    `Data (${diff.a.title})`, `Data (${diff.b.title})`,
  ];
  const lines = [head.map(csvCell).join(",")];
  for (const r of diff.rows) {
    lines.push([
      r.activity, STATUS_LABEL[r.status],
      r.who.a ?? "", r.who.b ?? "",
      r.taskType.a ?? "", r.taskType.b ?? "",
      list(r.systems.a ?? []), list(r.systems.b ?? []),
      list(r.data.a ?? []), list(r.data.b ?? []),
    ].map((v) => csvCell(String(v))).join(","));
  }

  const row = (cells: (string | number)[]) => lines.push(cells.map((v) => csvCell(String(v))).join(","));
  const block = (title: string, header: string[]) => { lines.push(""); lines.push(csvCell(title)); lines.push(header.map(csvCell).join(",")); };
  const kindLabel: Record<string, string> = { "review-comment": "Review Comment", "pain-point": "Pain Point", issue: "Issue", bottleneck: "Bottleneck" };

  // Roles / Systems / Data objects deltas (each a labelled block).
  const delta = (title: string, d: { added: string[]; removed: string[] }) => {
    if (!d.added.length && !d.removed.length) return;
    block(title, ["Change", "Value"]);
    for (const v of d.removed) row(["Removed", v]);
    for (const v of d.added) row(["Added", v]);
  };
  delta("Roles", diff.roleDiff);
  delta("Systems", diff.systemDiff);
  delta("Data objects", diff.dataObjectDiff);

  // Message flows.
  const md = diff.messageDiff;
  if (md.added.length || md.removed.length || md.changed.length) {
    block("Message flows", ["Change", "From", "To", "Before", "After"]);
    for (const m of md.removed) row(["Removed", m.from, m.to, m.label, ""]);
    for (const m of md.added) row(["Added", m.from, m.to, "", m.label]);
    for (const m of md.changed) row(["Changed", m.from, m.to, m.a, m.b]);
  }

  // Intermediate + boundary events.
  const ev = diff.eventDiff;
  if (ev.added.length || ev.removed.length || ev.changed.length) {
    block("Intermediate & boundary events", ["Change", "Kind", "Where", "Trigger (before)", "Trigger (after)"]);
    const where = (kind: string, w: string) => (kind === "boundary" ? `on ${w}` : (w || "(inline)"));
    for (const e of ev.removed) row(["Removed", e.kind, where(e.kind, e.kind === "boundary" ? e.host : e.label), evTrig(e), ""]);
    for (const e of ev.added) row(["Added", e.kind, where(e.kind, e.kind === "boundary" ? e.host : e.label), "", evTrig(e)]);
    for (const e of ev.changed) row(["Changed", e.kind, where(e.kind, e.where), e.a, e.b]);
  }

  // Automation changes.
  if (diff.automationChanges.length) {
    block("Automation changes", ["Activity", "Marker (before)", "Marker (after)", "What it signals"]);
    for (const c of diff.automationChanges) row([c.activity, c.from, c.to, c.note]);
  }

  // Review status.
  const rd = diff.reviewDiff;
  if (rd.added.length || rd.removed.length) {
    block(`Review status — ${rd.status}`, ["Change", "Kind", "Note", "Near"]);
    for (const r of rd.removed) row(["Removed", kindLabel[r.kind], r.text, r.location]);
    for (const r of rd.added) row(["Added", kindLabel[r.kind], r.text, r.location]);
  }

  return lines.join("\r\n");
}

/** Compact structured payload handed to the AI for the plain-English narrative —
 *  only the changed/added/removed rows (unchanged omitted to keep it focused). */
export function diffForAi(diff: ProcessDiff): unknown {
  const material = (r: ProcessDiffRow) => r.status !== "unchanged";
  return {
    before: diff.a.title,
    after: diff.b.title,
    summary: diff.summary,
    roleChanges: diff.roleDiff,
    systemChanges: diff.systemDiff,
    dataObjectChanges: diff.dataObjectDiff,
    messageChanges: diff.messageDiff,
    eventChanges: diff.eventDiff,
    reviewStatus: diff.reviewDiff,
    automationChanges: diff.automationChanges,
    activities: diff.rows.filter(material).map((r) => ({
      activity: r.activity,
      change: r.status,
      who: r.who.changed ? { from: r.who.a, to: r.who.b } : undefined,
      type: r.taskType.changed ? { from: r.taskType.a, to: r.taskType.b } : undefined,
      systems: r.systems.changed ? { from: r.systems.a, to: r.systems.b } : undefined,
      data: r.data.changed ? { from: r.data.a, to: r.data.b } : undefined,
    })),
  };
}
