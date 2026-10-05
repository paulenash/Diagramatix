/**
 * "move ten pixels right", "move selected 10 pixels left", "move the selected task right by fifty pixels"
 * (Paul, 2026-10-05: "move ten pixels right → couldn't find 'ten pixels'"). The distance had no place in the element move,
 * so it was read as the NAME of the thing to move. Pure — the grammar calls it.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/**
 * What the recogniser writes for "ten" — ONLY ever read here, in the one place a number is certain (right before "pixels"),
 * so it cannot turn a real word into a number anywhere else ("move highlighted task Send pixels left" was "ten pixels").
 */
const HEARD_AS_TEN = new Set(["send", "sent", "tin", "then", "tan", "tenn"]);

/** The number a spoken distance names — digits, words ("ten", "twenty five", "a hundred"), or null. */
export function pixelAmount(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (HEARD_AS_TEN.has(t)) return 10;
  const hund = t.match(/^(?:a|one)\s+hundred(?:\s+(?:and\s+)?(.+))?$/);
  if (hund) { const rest = hund[1] ? pixelAmount(hund[1]) : 0; return rest === null ? null : 100 + rest; }
  if (t in UNITS) return UNITS[t];
  const parts = t.split(/[-\s]+/);
  if (parts.length === 1 && parts[0] in TENS) return TENS[parts[0]];
  if (parts.length === 2 && parts[0] in TENS && parts[1] in UNITS && UNITS[parts[1]] >= 1 && UNITS[parts[1]] <= 9) return TENS[parts[0]] + UNITS[parts[1]];
  return null;
}

const NUM = `(?:\\d+|(?:a|one)\\s+hundred|(?:${Object.keys(TENS).join("|")})(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|${Object.keys(UNITS).join("|")}|${[...HEARD_AS_TEN].join("|")})`;
const DIR = "(left|right|up|down)";
const VERB = "(?:move|slide|nudge|shift|bump|inch)";

/**
 * Split a move with a pixel distance into its parts, in either order:
 *   "move [REF] [by] N pixels [to the] DIR"   and   "move [REF] [to the] DIR [by] N pixels".
 * `ref` is "" when the thing to move was not named (the caller supplies "this").
 */
export function readPixelMove(raw: string): { ref: string; direction: "left" | "right" | "up" | "down"; pixels: number } | null {
  const a = raw.match(new RegExp(`^${VERB}\\s+(?:(.*?)\\s+)?(?:by\\s+)?(${NUM})\\s*(?:px|pixels?)\\s+(?:to\\s+the\\s+)?${DIR}$`, "i"));
  if (a) { const n = pixelAmount(a[2]); if (n !== null) return { ref: (a[1] ?? "").trim(), direction: a[3].toLowerCase() as "left", pixels: n }; }
  const b = raw.match(new RegExp(`^${VERB}\\s+(?:(.*?)\\s+)?(?:to\\s+the\\s+)?${DIR}\\s+(?:by\\s+)?(${NUM})\\s*(?:px|pixels?)$`, "i"));
  if (b) { const n = pixelAmount(b[3]); if (n !== null) return { ref: (b[1] ?? "").trim(), direction: b[2].toLowerCase() as "left", pixels: n }; }
  return null;
}
