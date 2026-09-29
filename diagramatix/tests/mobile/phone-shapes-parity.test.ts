/**
 * The phone viewer (and the partner PDF) draw state-machine shapes, pain points
 * and the names outside events, gateways and data as the website does.
 *
 * Paul, 2026-09-29: "correct the known gaps" — one of them: "a few
 * state-machine shapes are still simplified on the phone". A state was a 4px
 * box with its name wrapped small; a fork/join was a yellow diamond; the
 * initial / final / history pseudo-states were plain boxes carrying their
 * stored names ("Initial", "Final"); a gateway's name ignored where it had been
 * dragged, so one moved above its diamond was drawn below it — or not at all,
 * outside the frame.
 *
 * The parity checks render the REAL canvas SymbolRenderer to markup and compare
 * its visible shapes and its text with the phone's, element by element, after
 * shifting the phone's picture back to the diagram's coordinates.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymbolRenderer, ShowPainPointDescCtx, ShowIssueDescCtx } from "@/app/components/canvas/SymbolRenderer";
import { FontScaleCtx } from "@/app/lib/diagram/displayMode";
import { renderTemplateThumbnailSvg, thumbnailFrameFor, thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";
import { renderDiagramSvg } from "@/app/lib/partner/renderDiagramSvg";
import { healOnLoad } from "@/app/lib/diagram/healOnLoad";
import { FORK_JOIN_FILL } from "@/app/lib/diagram/canvasPaint";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/** The phone / partner render — and the frame it is drawn in. */
const FULL = { trueColors: true, fullLabels: true } as const;

const el = (e: Record<string, unknown>) => ({ id: "e", x: 100, y: 100, width: 120, height: 50, label: "", properties: {}, ...e }) as unknown as DiagramElement;
const diagram = (els: DiagramElement[], extra: Record<string, unknown> = {}) => ({ elements: els, connectors: [], ...extra }) as unknown as DiagramData;

interface WebOpts { colorConfig?: SymbolColorConfig; fontScale?: number; painDesc?: boolean; issueDesc?: boolean }
const noop = () => {};
/** The website's markup for one element: the real SymbolRenderer under the canvas's providers. */
function website(e: DiagramElement, o: WebOpts = {}): string {
  let node: React.ReactElement = React.createElement(SymbolRenderer as never, {
    element: e, selected: false, isDropTarget: false, colorConfig: o.colorConfig,
    onSelect: noop, onMove: noop, onDoubleClick: noop, onConnectionPointDragStart: noop, showConnectionPoints: false,
  } as never);
  node = React.createElement(ShowPainPointDescCtx.Provider, { value: !!o.painDesc }, node);
  node = React.createElement(ShowIssueDescCtx.Provider, { value: !!o.issueDesc }, node);
  node = React.createElement(FontScaleCtx.Provider, { value: o.fontScale ?? 1 }, node);
  return renderToStaticMarkup(node);
}

/** The phone's picture of a diagram, and the frame it is drawn in. */
function phone(d: DiagramData, colorConfig?: SymbolColorConfig) {
  return { svg: renderTemplateThumbnailSvg(d, { ...FULL, colorConfig }), ...thumbnailFrameFor(d, FULL) };
}

interface Tag { tag: string; a: Record<string, string>; body: string }
function tags(markup: string): Tag[] {
  const out: Tag[] = [];
  for (const m of markup.matchAll(/<(rect|circle|ellipse|polygon|line|text|tspan)\b([^>]*?)(\/?)>/g)) {
    const a: Record<string, string> = {};
    for (const am of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) a[am[1]] = am[2];
    const after = markup.slice(m.index! + m[0].length);
    out.push({ tag: m[1], a, body: m[3] ? "" : after.slice(0, after.indexOf("<")) });
  }
  return out;
}

const paint = (v: string | undefined) => (v === "white" ? "#ffffff" : v ?? "none");
interface Shape { kind: string; nums: number[] }
/** Every VISIBLE shape (not a transparent hit area): its kind and paint, and its numbers with the coordinates shifted by (dx, dy). */
function shapes(markup: string, dx = 0, dy = 0): Shape[] {
  const X = ["x", "cx", "x1", "x2"], Y = ["y", "cy", "y1", "y2"], SIZE = ["width", "height", "r", "rx", "ry"];
  return tags(markup)
    .filter((t) => ["rect", "circle", "ellipse", "polygon", "line"].includes(t.tag))
    .filter((t) => t.a.fill !== "transparent" && !(paint(t.a.fill) === "none" && paint(t.a.stroke) === "none"))
    .map((t) => {
      const nums: number[] = [];
      for (const k of X) if (t.a[k] != null) nums.push(Number(t.a[k]) + dx);
      for (const k of Y) if (t.a[k] != null) nums.push(Number(t.a[k]) + dy);
      for (const k of SIZE) if (t.a[k] != null) nums.push(Number(t.a[k]));
      if (t.a.points) t.a.points.trim().split(/[\s,]+/).forEach((v, i) => nums.push(Number(v) + (i % 2 ? dy : dx)));
      const sw = paint(t.a.stroke) === "none" ? 0 : Number(t.a["stroke-width"] ?? 1);
      return { kind: `${t.tag} fill=${paint(t.a.fill)} stroke=${paint(t.a.stroke)} width=${sw}`, nums };
    });
}

interface Txt { s: string; x: number; y: number; fs: number; fill: string; bold: boolean }
/** Every piece of text, at its BASELINE (a middle / central dominant-baseline is taken as +0.35em — the phone's own rule, since the PDF cannot use it). */
function texts(markup: string, dx = 0, dy = 0): Txt[] {
  const out: Txt[] = [];
  let parent: Tag | null = null, shift = 0, lastY = NaN;
  const push = (body: string, x: number, y: number, p: Tag) => {
    const s = body.replace(/\s+/g, " ").trim();
    if (!s) return;
    out.push({ s, x: x + dx, y: y + dy, fs: Number(p.a["font-size"]), fill: p.a.fill, bold: ["bold", "700"].includes(p.a["font-weight"] ?? "") });
  };
  for (const t of tags(markup)) {
    if (t.tag === "text") {
      parent = t;
      const db = t.a["dominant-baseline"];
      shift = db === "middle" || db === "central" ? 0.35 * Number(t.a["font-size"]) : 0;
      lastY = t.a.y != null ? Number(t.a.y) + shift : NaN;
      push(t.body, Number(t.a.x), lastY, t);
    } else if (t.tag === "tspan" && parent) {
      lastY = t.a.y != null ? Number(t.a.y) + shift : lastY + Number(t.a.dy ?? 0);
      push(t.body, Number(t.a.x), lastY, parent);
    }
  }
  return out;
}

/** "" when every item on one side has its match on the other; else what is missing. */
function unmatched<T>(web: T[], ph: T[], same: (a: T, b: T) => boolean, show: (t: T) => string): string {
  const left = [...ph];
  for (const w of web) {
    const i = left.findIndex((p) => same(w, p));
    if (i < 0) return `on the website, not on the phone: ${show(w)}\nphone has: ${ph.map(show).join(" | ")}`;
    left.splice(i, 1);
  }
  return left.length ? `on the phone, not on the website: ${left.map(show).join(" | ")}` : "";
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sameShape = (a: Shape, b: Shape) => a.kind === b.kind && a.nums.length === b.nums.length && a.nums.every((v, k) => near(v, b.nums[k], 0.06));
const sameText = (a: Txt, b: Txt) => a.s === b.s && a.fs === b.fs && a.fill === b.fill && a.bold === b.bold && near(a.x, b.x, 0.1) && near(a.y, b.y, 0.1);
const showShape = (s: Shape) => `${s.kind} [${s.nums.map((n) => n.toFixed(1)).join(",")}]`;
const showText = (t: Txt) => `"${t.s}" @${t.x.toFixed(1)},${t.y.toFixed(1)} ${t.fs}px ${t.fill}${t.bold ? " bold" : ""}`;

/** The element drawn on the phone (alone in its diagram, with `extra` diagram settings) against the website. */
function compare(e: DiagramElement, o: { web?: WebOpts; extra?: Record<string, unknown>; shapes?: boolean } = {}) {
  const { svg, tx, ty } = phone(diagram([e], o.extra), o.web?.colorConfig);
  const web = website(e, o.web);
  const webShapes = shapes(web);
  return {
    svg, web, tx, ty,
    shapes: o.shapes === false ? ""
      : webShapes.length === 0 ? "the website drew no shape — nothing was compared"
      : unmatched(webShapes, shapes(svg, -tx, -ty), sameShape, showShape),
    texts: unmatched(texts(web), texts(svg, -tx, -ty), sameText, showText),
    phoneTexts: texts(svg, -tx, -ty),
  };
}

describe("T5060 — state-machine shapes drawn exactly as the website draws them (parity against the real SymbolRenderer)", () => {
  it("a state: 12px corners, the #374151 outline at 1.5, its colour, and its name on ONE line in the middle at the element font", () => {
    const r = compare(el({ type: "state", label: "Awaiting\nApproval" }));
    expect(r.shapes).toBe("");
    expect(r.texts).toBe("");
    expect(r.svg).toContain('rx="12" ry="12" fill="#dbeafe" stroke="#374151" stroke-width="1.5"');
    expect(r.phoneTexts.map((t) => t.s)).toEqual(["Awaiting Approval"]);
    // Its own colour (a heat map / theme) and the diagram's font size, as on the canvas.
    const own = compare(el({ type: "state", label: "Paid", properties: { fillColor: "#fde68a" } }), { extra: { fontSize: 15 }, web: { fontScale: 15 / 12 } });
    expect(own.shapes).toBe("");
    expect(own.texts).toBe("");
    expect(own.phoneTexts[0].fs).toBe(15);
  });

  it("a sub-machine: the state box plus its two-state marker bottom-right — blue when it links to its diagram, grey when not", () => {
    for (const props of [{ linkedDiagramId: "d-42" }, {}] as { linkedDiagramId?: string }[]) {
      const r = compare(el({ type: "submachine", label: "Billing", properties: props }));
      expect(r.shapes, JSON.stringify(props)).toBe("");
      expect(r.texts).toBe("");
      expect(r.svg).toContain(props.linkedDiagramId ? 'stroke="#2563eb" stroke-width="1.2"' : 'stroke="#c0c0c0" stroke-width="1.2"');
    }
  });

  it("initial, final, history and deep history: the website's discs, rings and H / H* glyphs — and no name, whatever is stored", () => {
    for (const [type, label] of [["initial-state", "Initial"], ["final-state", "Final"], ["history-state", "History"], ["deep-history-state", "Deep History"]]) {
      const r = compare(el({ type, label, width: 30, height: 30 }));
      expect(r.shapes, type).toBe("");
      expect(r.texts, type).toBe("");
      expect(r.svg, type).not.toContain(`>${label}<`);
    }
    const deep = compare(el({ type: "deep-history-state", label: "History", width: 30, height: 30 }));
    expect(deep.phoneTexts.map((t) => t.s)).toEqual(["H", "*"]);
  });

  it("a history state is WHITE inside even when the colour config makes its colour dark; the initial and final discs take the config", () => {
    const dark = { "history-state": "#000000", "deep-history-state": "#000000", "initial-state": "#7c2d12", "final-state": "#7c2d12" } as unknown as SymbolColorConfig;
    for (const type of ["history-state", "deep-history-state", "initial-state", "final-state"]) {
      const r = compare(el({ type, width: 30, height: 30 }), { web: { colorConfig: dark } });
      expect(r.shapes, type).toBe("");
    }
    const h = compare(el({ type: "history-state", width: 30, height: 30 }), { web: { colorConfig: dark } });
    expect(h.svg).toContain('fill="#ffffff" stroke="#374151" stroke-width="2"');
    expect(compare(el({ type: "initial-state", width: 30, height: 30 }), { web: { colorConfig: dark } }).svg).toContain('fill="#7c2d12"');
  });

  it("a fork / join is a solid dark bar (never the gateway's yellow diamond), whatever the colour config, with no name", () => {
    const red = { "fork-join": "#ff0000" } as unknown as SymbolColorConfig;
    for (const web of [{}, { colorConfig: red }]) {
      const r = compare(el({ type: "fork-join", label: "Fork/Join", width: 80, height: 8 }), { web });
      expect(r.shapes).toBe("");
      expect(r.texts).toBe("");
      expect(r.svg).toContain(`rx="2" ry="2" fill="${FORK_JOIN_FILL}"/>`);
      expect(r.svg).not.toContain("<polygon");
    }
  });
});

describe("T5061 — pain points and issues: the website's starburst, number and description", () => {
  it("the star in the marker colour with its red / green outline, the number bold in the middle (smaller for two digits)", () => {
    for (const [type, label] of [["uml-pain-point", "3"], ["uml-pain-point", "12"], ["uml-issue", "7"]]) {
      const r = compare(el({ type, label, width: 40, height: 40, properties: { description: "Keyed twice\nby hand" } }));
      expect(r.shapes, `${type} ${label}`).toBe("");
      expect(r.texts, `${type} ${label}`).toBe("");
      expect(r.phoneTexts.map((t) => t.s), "no description unless the diagram shows them").toEqual([label]);
    }
  });

  it("with the diagram's descriptions switched on, each line of the description under the star, as the website sets it", () => {
    const pain = el({ type: "uml-pain-point", label: "4", width: 40, height: 40, properties: { description: "Keyed twice\nby hand" } });
    const p = compare(pain, { extra: { showPainPointDescriptions: true }, web: { painDesc: true } });
    expect(p.texts).toBe("");
    expect(p.phoneTexts.map((t) => t.s)).toEqual(["4", "Keyed twice", "by hand"]);
    const issue = el({ type: "uml-issue", label: "2", width: 40, height: 40, properties: { description: "No owner" } });
    const i = compare(issue, { extra: { showIssueDescriptions: true, fontSize: 14 }, web: { issueDesc: true, fontScale: 14 / 12 } });
    expect(i.texts).toBe("");
    expect(i.svg).toContain('fill="#166534" font-family="sans-serif"><tspan');
    // The pain-point switch does not show an issue's description, nor the other way round.
    expect(compare(issue, { extra: { showPainPointDescriptions: true } }).phoneTexts.map((t) => t.s)).toEqual(["2"]);
  });
});

describe("T5062 — names outside the shape sit where the website puts them: at their stored offset, wrapped to their width", () => {
  it("a choice gateway's name dragged above and right of its diamond is drawn there (11px, #111827, 14px lines), with the diamond at 1.5", () => {
    const g = el({ type: "gateway", x: 100, y: 100, width: 40, height: 40, label: "Amount over the approval limit?", properties: { labelOffsetX: 30, labelOffsetY: -95 } });
    const r = compare(g);
    expect(r.shapes).toBe("");
    expect(r.texts).toBe("");
    expect(r.phoneTexts.length, "wrapped to the 80px column").toBeGreaterThan(1);
    expect(Math.max(...r.phoneTexts.map((t) => t.y)), "above the diamond").toBeLessThan(100);
    // The default place (7px under the shape) and a wider column.
    expect(compare(el({ type: "gateway", width: 40, height: 40, label: "Approved?" })).texts).toBe("");
    expect(compare(el({ type: "gateway", width: 40, height: 40, label: "Amount over the approval limit?", properties: { labelWidth: 160 } })).texts).toBe("");
  });

  it("a merge gateway has no name, as on the website", () => {
    const r = compare(el({ type: "gateway", width: 40, height: 40, label: "Merge", properties: { gatewayRole: "merge" } }));
    expect(r.texts).toBe("");
    expect(r.phoneTexts).toEqual([]);
  });

  it("events, data objects (with their [state]), data stores and an icon-only ArchiMate actor: the same external name, at its offset", () => {
    const cases = [
      el({ type: "start-event", width: 36, height: 36, label: "Order received", properties: { labelOffsetX: -40, labelOffsetY: -20 } }),
      el({ type: "intermediate-event", width: 36, height: 36, label: "Wait for payment" }),
      el({ type: "end-event", width: 36, height: 36, label: "Order closed", properties: { labelOffsetY: 20 } }),
      el({ type: "data-object", width: 36, height: 50, label: "Invoice", properties: { state: "Approved" } }),
      el({ type: "data-object", width: 36, height: 50, label: "", properties: { state: "Draft" } }),
      el({ type: "data-store", width: 50, height: 50, label: "Customer records", properties: { labelOffsetX: 60 } }),
      el({ type: "archimate-shape", width: 30, height: 60, label: "Account holder", properties: { archimateIconOnly: true, shapeKey: "business-business-actor-icon", labelOffsetY: 12 } }),
    ];
    for (const e of cases) {
      const r = compare(e, { shapes: false });
      expect(r.texts, `${e.type} ${e.label}`).toBe("");
      expect(r.phoneTexts.length, `${e.type} ${e.label}`).toBeGreaterThan(0);
    }
  });

  it("a start or end event on an activity's boundary has no name, as on the website", () => {
    const r = compare(el({ type: "start-event", width: 36, height: 36, label: "Escalated", boundaryHostId: "t1" }), { shapes: false });
    expect(r.texts).toBe("");
    expect(r.phoneTexts).toEqual([]);
  });
});

describe("T5063 — the frame holds every name drawn outside its shape (the phone's pins and taps and the PDF page use it)", () => {
  const top = el({ id: "g", type: "gateway", x: 200, y: 0, width: 40, height: 40, label: "Credit checked?", properties: { labelOffsetY: -90, labelOffsetX: 150 } });
  const task = el({ id: "t", type: "state", x: 0, y: 0, width: 120, height: 50, label: "Draft" });
  const d = diagram([task, top]);

  it("a gateway name dragged above the top row and out to the right is inside the picture", () => {
    const { svg, tx, ty, w, h } = phone(d);
    const plain = thumbnailTransform(d.elements);
    expect(ty, "the frame reaches up to the name").toBeGreaterThan(plain.ty + 40);
    expect(w, "and out to it").toBeGreaterThan(plain.w + 100);
    expect(svg).toContain(`viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}"`);
    const names = texts(svg).filter((t) => /Credit|checked/.test(t.s));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(n.y - n.fs, n.s).toBeGreaterThan(0);
      expect(n.x + (n.s.length * n.fs * 0.55) / 2, n.s).toBeLessThan(w);
      expect(n.x - tx, "drawn at its offset").toBeCloseTo(220 + 150, 0);
    }
  });

  it("pain-point descriptions under the lowest element are inside it — only when the diagram shows them", () => {
    const pp = el({ id: "pp", type: "uml-pain-point", x: 0, y: 200, width: 40, height: 40, label: "1", properties: { description: "Rekeyed\ninto the ledger\nevery night" } });
    const off = thumbnailFrameFor(diagram([task, pp]), FULL);
    const on = thumbnailFrameFor(diagram([task, pp], { showPainPointDescriptions: true }), FULL);
    expect(off.h).toBe(thumbnailTransform([task, pp]).h);
    expect(on.h).toBeGreaterThan(off.h + 30);
    expect(thumbnailFrameFor(diagram([task, pp], { showPainPointDescriptions: true, showPainPoints: false }), FULL).h, "hidden markers add nothing").toBe(off.h);
  });

  it("the partner PDF's page is that frame; the compact template preview keeps its elements-only frame", () => {
    const svg = renderDiagramSvg(d);
    const { w, h } = thumbnailFrameFor(healOnLoad(d), FULL);
    expect(Number(/width="(\d+)"/.exec(svg)?.[1])).toBe(Math.max(1, Math.round(w)));
    expect(Number(/height="(\d+)"/.exec(svg)?.[1])).toBe(Math.max(1, Math.round(h)));
    expect(thumbnailFrameFor(d)).toEqual(thumbnailTransform(d.elements));
  });
});

describe("T5064 — the compact preview, and odd data, are safe", () => {
  it("the compact template preview: state boxes rounded as on the website, fork/join a dark bar, a one-line name under a gateway", () => {
    const d = diagram([
      el({ id: "s", type: "state", x: 0, y: 0, label: "Open" }),
      el({ id: "fj", type: "fork-join", x: 200, y: 0, width: 80, height: 8, label: "Fork/Join" }),
      el({ id: "g", type: "gateway", x: 320, y: 0, width: 40, height: 40, label: "Valid?", properties: { labelOffsetY: -80 } }),
      el({ id: "i", type: "initial-state", x: 400, y: 0, width: 30, height: 30, label: "Initial" }),
    ]);
    const svg = renderTemplateThumbnailSvg(d);
    const { tx, ty } = thumbnailFrameFor(d);
    expect(svg).toContain(`<rect x="${tx}" y="${ty}" width="120" height="50" rx="12" ry="12"`);
    expect(svg).toContain(`<rect x="${200 + tx}" y="${ty}" width="80" height="8" rx="2" ry="2" fill="${FORK_JOIN_FILL}"/>`);
    expect(svg.match(/<polygon/g) ?? [], "the gateway is the only diamond").toHaveLength(1);
    expect(svg).toContain(`<text x="${(340 + tx).toFixed(1)}" y="${(40 + ty + 11).toFixed(1)}" text-anchor="middle" font-size="10"`);
    expect(svg).not.toContain(">Initial<");
    expect(svg).not.toContain(">Fork/Join<");
  });

  it("a typeless element, and junk in the label / description settings, never throw or draw NaN", () => {
    const typeless = { id: "x", x: 0, y: 0, width: 100, height: 60, label: "Legacy", properties: { labelOffsetY: -200 } } as unknown as DiagramElement;
    const junk = [
      el({ id: "g", type: "gateway", x: 200, width: 40, height: 40, label: "Odd?", properties: { labelOffsetX: "abc", labelOffsetY: null, labelWidth: "wide" } }),
      el({ id: "d", type: "data-object", x: 300, width: 36, height: 50, label: "Doc", properties: { state: 0 } }),
      el({ id: "p", type: "uml-pain-point", x: 400, width: 40, height: 40, label: "1", properties: { description: 42 } }),
      el({ id: "sm", type: "submachine", x: 500, label: "Sub", properties: null }),
    ];
    const d = diagram([typeless, ...junk], { showPainPointDescriptions: true });
    let svg = "";
    expect(() => { svg = renderTemplateThumbnailSvg(d, FULL); }).not.toThrow();
    expect(() => renderTemplateThumbnailSvg(d)).not.toThrow();
    expect(svg).not.toContain("NaN");
    expect(svg).toContain(">Legacy<");
    // A typeless element's label is inside its box, so the frame does not reach for it.
    expect(thumbnailFrameFor(diagram([typeless]), FULL)).toEqual(thumbnailTransform([typeless]));
    const f = thumbnailFrameFor(d, FULL);
    expect([f.tx, f.ty, f.w, f.h].every(Number.isFinite)).toBe(true);
  });
});
