/**
 * The Simulation Data table has to FIT.
 *
 * Paul, 2026-09-07: "Task fields overflow past the right hand boundary." Fixed
 * by scrolling inside the panel. Paul, 2026-09-11: "SIMULATION DATA too narrow
 * for all its possible contents, even with the horizontal scroll, which should
 * be removed. Task names are not properly visible."
 *
 * Both reports have one cause. The console grid was capped at `max-w-6xl`
 * (1152px) while the Tasks row's fixed columns need about 1310px — so the table
 * could not fit on ANY display, the scrollbar was permanent rather than a
 * narrow-window fallback, and the element name was pinned at a truncated 160px
 * while three distribution columns took 288px each.
 *
 * This test does the arithmetic, because that is the part nobody re-checks: it
 * reads the real column widths out of the component and compares their sum
 * against the real cap read out of the console. A future column added to Tasks
 * fails here rather than quietly bringing the scrollbar back.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const PANEL = fs.readFileSync(path.join(ROOT, "app/components/simulation/SimDataPanel.tsx"), "utf8");
const CONSOLE = fs.readFileSync(path.join(ROOT, "app/components/simulation/SimulatorConsole.tsx"), "utf8");

/**
 * The same source with comments removed.
 *
 * These files EXPLAIN the layout they no longer use — "there is no min-w-max
 * here" — so a plain text search finds the prose and passes, or fails, on the
 * wrong thing. It found the comment on the first run of this test.
 */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PANEL_CODE = codeOf(PANEL);

/** Tailwind `w-N` → px (the default 0.25rem scale, 16px root). */
const w = (n: number) => n * 4;

/** Tailwind's named `max-w-*` caps, in px. */
const NAMED_MAX_W: Record<string, number> = {
  "3xl": 768, "4xl": 896, "5xl": 1024, "6xl": 1152, "7xl": 1280,
};

/**
 * The width cap on the console's panel grid, however it is spelled.
 *
 * Reading only `max-w-[Npx]` would make this test about class SYNTAX: swapping
 * the arbitrary value for `max-w-7xl` would fail it with "no explicit px cap"
 * rather than with the arithmetic, which is the thing actually worth knowing.
 */
function consoleCapPx(): number {
  const grid = CONSOLE.match(/max-w-(\[(\d+)px\]|[0-9a-z]+)\s+mx-auto grid[^"]*md:grid-cols-3/);
  if (!grid) throw new Error("could not find the console's panel grid and its max-w cap");
  if (grid[2]) return Number(grid[2]);
  const named = NAMED_MAX_W[grid[1]];
  if (named === undefined) throw new Error(`unrecognised cap "max-w-${grid[1]}" — add it to NAMED_MAX_W`);
  return named;
}

/**
 * The Tasks section's columns, in render order, read from its `cols` array.
 *
 * Derived so that adding a column changes the sum this test computes, instead
 * of leaving it measuring yesterday's row.
 */
function tasksColumns(): string[] {
  const at = PANEL.indexOf('<Section title="Tasks"');
  if (at < 0) throw new Error("Tasks section not found");
  const cols = PANEL.slice(at, PANEL.indexOf(">", PANEL.indexOf("cols={[", at)));
  return [...cols.matchAll(/w:\s*W\.(\w+)/g)].map((m) => m[1]);
}

/** The width token declared for a column in the W map, e.g. dist: "w-72 min-w-0". */
function columnPx(name: string): number {
  const m = PANEL.match(new RegExp(`\\n\\s*${name}:\\s*"([^"]+)"`));
  if (!m) throw new Error(`column "${name}" not found in the W map`);
  const cls = m[1];
  if (/flex-1/.test(cls)) return 0;           // takes leftover, demands nothing
  const px = cls.match(/\bw-(\d+)\b/);
  if (!px) throw new Error(`column "${name}" has no fixed width: ${cls}`);
  return w(Number(px[1]));
}

describe("Simulation Data fits the console", () => {
  it("T4228 — the widest row's fixed columns fit inside the console's own cap", () => {
    const capPx = consoleCapPx();

    // The Tasks row — the widest section — READ OUT OF THE COMPONENT rather
    // than written here. A hand-kept list goes stale the moment a column is
    // added, and then this test passes by measuring a row that no longer
    // exists: exactly what happened when "needs these skills" arrived.
    const TASKS = tasksColumns();
    expect(TASKS.length, "could not read the Tasks columns out of the component").toBeGreaterThanOrEqual(7);

    const GAP = 8;                                  // gap-2 between cells
    const PANEL_PADDING = 12 * 2;                   // MatrixPanel p-3
    const fixed = TASKS.reduce((sum, c) => sum + columnPx(c), 0) + GAP * (TASKS.length - 1);

    const available = capPx - PANEL_PADDING;
    expect(fixed, "Tasks' fixed columns exceed the console cap — the scrollbar is back").toBeLessThan(available);

    // ...and with room to spare for the columns that TAKE the slack. A fit with
    // 20px left over is not a fit anyone would call one, and the leftover is
    // shared between every flexible column, so the bar scales with how many
    // there are.
    const flexCount = TASKS.filter((c) => columnPx(c) === 0).length;
    expect(flexCount, "no flexible column — the element name is pinned again").toBeGreaterThanOrEqual(1);
    expect(available - fixed, "not enough width left for the flexible columns")
      .toBeGreaterThanOrEqual(150 * flexCount);
  });

  it("T4229 — the name column takes the leftover instead of a fixed truncated width", () => {
    expect(columnPx("name")).toBe(0);               // flex-1: demands nothing, grows
    expect(PANEL).toMatch(/name:\s*"flex-1 min-w-0"/);
    // `flex-1` only grows when the container is NOT max-content. That pairing is
    // exactly what pinned the names before, so pin its absence.
    expect(PANEL_CODE).not.toContain("min-w-max");
  });

  it("T4230 — the permanent horizontal scrollbar is gone", () => {
    // Paul asked for it removed, and with the cap raised it is no longer the
    // thing standing between the table and its own border.
    expect(PANEL_CODE).not.toContain("overflow-x-auto");
  });
});
