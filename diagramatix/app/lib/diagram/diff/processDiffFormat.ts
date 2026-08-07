/**
 * Presentation formatters for a ProcessDiff — a Markdown document (rendered to
 * .docx via buildDocx, tables and all) and a flat CSV. Kept separate from the
 * pure diff engine so the engine has no formatting concerns.
 */
import type { ProcessDiff, ProcessDiffRow, DiffStatus } from "./processDiff";

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

  // Message flows — added / removed / relabelled between the versions.
  const md = diff.messageDiff;
  if (md.added.length || md.removed.length || md.changed.length) {
    out.push("");
    out.push("**Message flows**");
    out.push("");
    out.push("| Change | From | To | Message |");
    out.push("| --- | --- | --- | --- |");
    for (const m of md.removed) out.push(`| Removed | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(m.label || "—")} |`);
    for (const m of md.added) out.push(`| Added | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(m.label || "—")} |`);
    for (const m of md.changed) out.push(`| Changed | ${mdCell(m.from)} | ${mdCell(m.to)} | ${mdCell(`${m.a || "—"} → ${m.b || "—"}`)} |`);
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

  // Message flows as a second block (blank-line separated).
  const md = diff.messageDiff;
  if (md.added.length || md.removed.length || md.changed.length) {
    lines.push("");
    lines.push(["Message change", "From", "To", "Before", "After"].map(csvCell).join(","));
    for (const m of md.removed) lines.push(["Removed", m.from, m.to, m.label, ""].map((v) => csvCell(String(v))).join(","));
    for (const m of md.added) lines.push(["Added", m.from, m.to, "", m.label].map((v) => csvCell(String(v))).join(","));
    for (const m of md.changed) lines.push(["Changed", m.from, m.to, m.a, m.b].map((v) => csvCell(String(v))).join(","));
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
    messageChanges: diff.messageDiff,
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
