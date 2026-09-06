/**
 * What falls in the cascade.
 *
 * Paul, 2026-09-07: the Simulator's rain becomes "a cascade of small green BPMN
 * symbols", and the Miner's becomes "small brown jagged rocks (50%) small brown
 * BPMN symbols (50%)".
 *
 * Drawn rather than typed. Unicode has no BPMN, and the near-miss characters
 * (◇ ○ ▭) read as punctuation at 16px rather than as a notation anyone
 * recognises. A dozen lines of canvas gives the real shapes — the double ring of
 * an intermediate event, the plus in a parallel gateway, the folded corner of a
 * data object — and they stay legible small, which is the whole point of a
 * cascade.
 */

export type GlyphSet = "katakana" | "bpmn" | "rocks-and-bpmn";

/** The BPMN shapes worth recognising at a glance, in falling order of frequency. */
const BPMN_KINDS = [
  "task", "start", "end", "intermediate", "exclusive", "parallel",
  "subprocess", "data", "message",
] as const;
type BpmnKind = (typeof BPMN_KINDS)[number];

/**
 * One BPMN symbol, centred in a `size` box at (x, y).
 *
 * Stroked, not filled, so the shapes stay open at small sizes — a filled
 * gateway at 16px is a blob, and the point of a cascade of BPMN symbols is that
 * they are identifiably BPMN.
 */
function drawBpmn(ctx: CanvasRenderingContext2D, kind: BpmnKind, x: number, y: number, size: number) {
  const s = size * 0.82;
  const cx = x + size / 2, cy = y + size / 2;
  const r = s / 2;
  ctx.lineWidth = Math.max(1, size / 14);
  ctx.beginPath();
  switch (kind) {
    case "start":
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "end":
      // The thick ring that says "this is where it stops".
      ctx.lineWidth = Math.max(2, size / 6);
      ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "intermediate":
      ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "task": {
      const w = s, h = s * 0.66, rr = s * 0.14;
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, rr);
      ctx.stroke();
      break;
    }
    case "subprocess": {
      const w = s, h = s * 0.66, rr = s * 0.14;
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, rr);
      ctx.stroke();
      // The collapsed-subprocess plus, on the bottom edge.
      const b = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx - b, cy + h / 2 - b * 1.4); ctx.lineTo(cx + b, cy + h / 2 - b * 1.4);
      ctx.moveTo(cx, cy + h / 2 - b * 2.4); ctx.lineTo(cx, cy + h / 2 - b * 0.4);
      ctx.stroke();
      break;
    }
    case "exclusive":
    case "parallel": {
      diamond(ctx, cx, cy, r);
      ctx.stroke();
      const m = r * 0.38;
      ctx.beginPath();
      if (kind === "exclusive") {
        ctx.moveTo(cx - m, cy - m); ctx.lineTo(cx + m, cy + m);
        ctx.moveTo(cx + m, cy - m); ctx.lineTo(cx - m, cy + m);
      } else {
        ctx.moveTo(cx - m, cy); ctx.lineTo(cx + m, cy);
        ctx.moveTo(cx, cy - m); ctx.lineTo(cx, cy + m);
      }
      ctx.stroke();
      break;
    }
    case "data": {
      // A page with its corner turned down.
      const w = s * 0.62, h = s * 0.86, fold = w * 0.34;
      const l = cx - w / 2, t = cy - h / 2;
      ctx.moveTo(l, t);
      ctx.lineTo(l + w - fold, t);
      ctx.lineTo(l + w, t + fold);
      ctx.lineTo(l + w, t + h);
      ctx.lineTo(l, t + h);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(l + w - fold, t); ctx.lineTo(l + w - fold, t + fold); ctx.lineTo(l + w, t + fold);
      ctx.stroke();
      break;
    }
    case "message": {
      // The envelope of a message flow.
      const w = s * 0.86, h = s * 0.6;
      const l = cx - w / 2, t = cy - h / 2;
      ctx.rect(l, t, w, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(l, t); ctx.lineTo(cx, cy); ctx.lineTo(l + w, t);
      ctx.stroke();
      break;
    }
  }
}

/**
 * A jagged rock: an irregular polygon, filled.
 *
 * Deliberately random per draw, so the cascade never repeats a silhouette — a
 * handful of fixed rock shapes tiling down the screen reads as wallpaper, which
 * is the opposite of rain.
 */
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2, cy = y + size / 2;
  const r = size * 0.38;
  const points = 6 + Math.floor(Math.random() * 3);
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rad = r * (0.55 + Math.random() * 0.55);
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const KATAKANA = (
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
  "0123456789ABCDEF" +
  "ﾊﾋﾌﾍﾎﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ"
).split("");

/**
 * Draw one falling glyph at (x, y) in a `size` box, in the current colour.
 *
 * The caller has already set fillStyle/strokeStyle to the head or trail colour,
 * so a glyph only decides its SHAPE — which is what lets the same cascade run
 * green for the Simulator and brown for the Miner.
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D, set: GlyphSet, x: number, y: number, size: number, colour: string,
) {
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  if (set === "katakana") {
    ctx.fillText(KATAKANA[Math.floor(Math.random() * KATAKANA.length)], x, y);
    return;
  }
  // Half rocks, half BPMN — Paul's mix for the Miner, which is what mining IS:
  // the ground you dig through, and what you find in it.
  if (set === "rocks-and-bpmn" && Math.random() < 0.5) {
    drawRock(ctx, x, y, size);
    return;
  }
  drawBpmn(ctx, BPMN_KINDS[Math.floor(Math.random() * BPMN_KINDS.length)], x, y, size);
}
