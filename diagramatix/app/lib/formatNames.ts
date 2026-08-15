/**
 * Join a list of display names into readable English:
 *   []            → "Someone"   (defensive fallback)
 *   ["A"]         → "A"
 *   ["A","B"]     → "A and B"
 *   ["A","B","C"] → "A, B and C"
 */
export function formatNameList(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "Someone";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
