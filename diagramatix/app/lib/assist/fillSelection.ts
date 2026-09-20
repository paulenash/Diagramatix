/**
 * M4 — fill the selection: give several selected elements their values in one
 * breath.
 *
 * "Name these Receive, Check and Ship" is a different shape from every other
 * command. Everything else names ONE target and says one thing about it; this
 * names none and says several, relying entirely on the selection and on the
 * ORDER the elements are read in. That order is the whole design problem, and
 * it is why this is a pure module with its own tests rather than a few lines
 * inside the apply loop.
 *
 * READING ORDER, and why it is not simply left-to-right. A BPMN diagram is laid
 * out in bands: a lane of tasks runs left to right, and the next lane starts
 * again at the left. Sorting by x alone interleaves two lanes into nonsense.
 * Sorting by y alone breaks a single row whose elements differ by a pixel. So
 * elements are grouped into ROWS first — anything whose vertical centres are
 * within half a row-height of each other is the same row — and each row is then
 * read left to right. This is the order a person reads the diagram in, which is
 * the order they will say the names in.
 *
 * COUNT MISMATCH IS REFUSED, NOT TRUNCATED. Three names over four selected
 * elements is a mistake, not an instruction to leave the fourth alone: the
 * user has almost certainly mis-counted or the recogniser has dropped a name,
 * and quietly renaming three of them leaves a diagram that looks finished and
 * is wrong. So it reports both counts and changes nothing.
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";

/** Two elements are on the same row when their centres are this close, as a
 *  fraction of the taller one's height. Generous, because a row of mixed
 *  symbols (a task beside a gateway) is not aligned to the pixel. */
const ROW_TOLERANCE = 0.6;

const centreY = (e: DiagramElement) => e.y + e.height / 2;

/**
 * The selected elements in reading order: rows top to bottom, each row left to
 * right.
 *
 * Deterministic for any input — a tie on both axes falls back to id, so the
 * same selection always fills the same way.
 */
export function readingOrder(elements: readonly DiagramElement[]): DiagramElement[] {
  const byY = [...elements].sort((a, b) => centreY(a) - centreY(b) || a.x - b.x || a.id.localeCompare(b.id));

  const rows: DiagramElement[][] = [];
  for (const e of byY) {
    const row = rows[rows.length - 1];
    if (row) {
      const prev = row[row.length - 1];
      const tolerance = Math.max(prev.height, e.height) * ROW_TOLERANCE;
      if (Math.abs(centreY(e) - centreY(prev)) <= tolerance) { row.push(e); continue; }
    }
    rows.push([e]);
  }

  return rows.flatMap((row) =>
    [...row].sort((a, b) => a.x - b.x || centreY(a) - centreY(b) || a.id.localeCompare(b.id)),
  );
}

export type FillPlan =
  | { ok: true; assign: { id: string; label: string }[] }
  | { ok: false; reason: string };

/**
 * Pair `labels` with `elements` in reading order.
 *
 * The counts must match exactly. Saying three names for four selected elements
 * is a mis-count, and filling three of them would leave a diagram that looks
 * done and is not.
 */
export function planLabelFill(
  elements: readonly DiagramElement[],
  labels: readonly string[],
): FillPlan {
  const names = labels.map((l) => l.trim()).filter(Boolean);
  if (!elements.length) return { ok: false, reason: "nothing is selected" };
  if (!names.length) return { ok: false, reason: "I didn't catch any names" };
  if (names.length !== elements.length) {
    return {
      ok: false,
      reason: `${names.length} name${names.length === 1 ? "" : "s"} for ${elements.length} selected element${elements.length === 1 ? "" : "s"} — select the same number, or say them again`,
    };
  }
  const ordered = readingOrder(elements);
  return { ok: true, assign: ordered.map((e, i) => ({ id: e.id, label: names[i] })) };
}
