import type { UmlAttribute, UmlOperation } from "./types";

/**
 * Parse a free-text UML attribute row into structured fields.
 *
 * Grammar (each part optional except the name):
 *   [visibility] [/] name [ : type ] [ [multiplicity] ] [ = default ]
 *
 * - visibility: a leading `+`, `-` or `#` (the model has no `~`).
 * - `/` immediately before the name marks a derived attribute (`isDerived`).
 * - `[ … ]` anywhere in the remainder is the multiplicity (e.g. `0..*`).
 * - ` = … ` (to end of string) is the default value; quotes are preserved
 *   verbatim, so `= "25 Miller Street"` keeps its quotes.
 * - `: …` (before any `[` or `=`) is the type.
 *
 * Example: `+ customerAddresses: String[0..*] = "25 Miller Street"` →
 *   { visibility:"+", name:"customerAddresses", type:"String",
 *     multiplicity:"0..*", defaultValue:'"25 Miller Street"' }
 */
export function parseUmlAttribute(text: string): UmlAttribute {
  let s = text.trim();

  // Visibility — a single leading +/-/# glyph.
  let visibility: UmlAttribute["visibility"];
  if (s[0] === "+" || s[0] === "-" || s[0] === "#") {
    visibility = s[0] as UmlAttribute["visibility"];
    s = s.slice(1).trim();
  }

  // Derived — a leading slash.
  let isDerived: boolean | undefined;
  if (s.startsWith("/")) {
    isDerived = true;
    s = s.slice(1).trim();
  }

  // Constraints — trailing `{…}` groups: {PK}, {FK → Table.col}, {NOT NULL}, or
  // a custom propertyString. Stripped before the rest is parsed. Inverse of the
  // renderer's formatUmlAttribute constraint output.
  let primaryKey: boolean | undefined, foreignKey: boolean | undefined, notNull: boolean | undefined;
  let fkTable: string | undefined, fkColumn: string | undefined, propertyString: string | undefined;
  const leftover: string[] = [];
  for (const cm of s.matchAll(/\{([^}]*)\}/g)) {
    const c = cm[1].trim();
    if (/^PK$/i.test(c)) primaryKey = true;
    else if (/^NOT\s*NULL$/i.test(c)) notNull = true;
    else if (/^FK\b/i.test(c)) {
      foreignKey = true;
      const ref = c.replace(/^FK\s*(?:→|->)?\s*/i, "").trim();
      if (ref) { const [t, col] = ref.split("."); fkTable = t || undefined; fkColumn = col || undefined; }
    } else leftover.push(`{${c}}`);
  }
  if (leftover.length) propertyString = leftover.join(" ");
  s = s.replace(/\{[^}]*\}/g, "").trim();

  // Default value — everything after the first `=`.
  let defaultValue: string | undefined;
  const eqIdx = s.indexOf("=");
  if (eqIdx !== -1) {
    const d = s.slice(eqIdx + 1).trim();
    if (d) defaultValue = d;
    s = s.slice(0, eqIdx).trim();
  }

  // Multiplicity — the first `[ … ]` group.
  let multiplicity: string | undefined;
  const multMatch = s.match(/\[([^\]]*)\]/);
  if (multMatch) {
    const m = multMatch[1].trim();
    if (m) multiplicity = m;
    s = (s.slice(0, multMatch.index) + s.slice(multMatch.index! + multMatch[0].length)).trim();
  }

  // Type — after the first `:`.
  let type: string | undefined;
  const colonIdx = s.indexOf(":");
  if (colonIdx !== -1) {
    const t = s.slice(colonIdx + 1).trim();
    if (t) type = t;
    s = s.slice(0, colonIdx).trim();
  }

  const name = s.trim();

  const attr: UmlAttribute = { name };
  if (visibility) attr.visibility = visibility;
  if (isDerived) attr.isDerived = true;
  if (type) attr.type = type;
  if (multiplicity) attr.multiplicity = multiplicity;
  if (defaultValue) attr.defaultValue = defaultValue;
  if (primaryKey) attr.primaryKey = true;
  if (foreignKey) attr.foreignKey = true;
  if (notNull) attr.notNull = true;
  if (fkTable) attr.fkTable = fkTable;
  if (fkColumn) attr.fkColumn = fkColumn;
  if (propertyString) attr.propertyString = propertyString;
  return attr;
}

/**
 * Parse a free-text UML operation row into structured fields. At this stage the
 * model carries only visibility + name (no parameters or return type), so we
 * strip a leading visibility glyph and a trailing `()`.
 *
 * Example: `+getCustName()` → { visibility:"+", name:"getCustName" }
 */
export function parseUmlOperation(text: string): UmlOperation {
  let s = text.trim();

  let visibility: UmlOperation["visibility"];
  if (s[0] === "+" || s[0] === "-" || s[0] === "#") {
    visibility = s[0] as UmlOperation["visibility"];
    s = s.slice(1).trim();
  }

  // Drop any parentheses the user typed — the `()` is auto-added at display
  // time, so the stored name never carries them (and can never be doubled).
  s = s.replace(/\([^)]*\)/g, "").trim();

  const op: UmlOperation = { name: s };
  if (visibility) op.visibility = visibility;
  return op;
}
