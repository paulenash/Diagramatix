/**
 * Tiny dependency-free syntax highlighters for the file-preview pop-up, using the
 * "Peaceful JSON" palette (peacefuljson.com/colors.html) on a dark canvas. Each
 * returns HTML with inline-styled <span>s (inline styles so nothing is purged).
 * Only &, <, > are escaped — quotes are kept so the tokenisers can see them.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (color: string, s: string, bold = false) => `<span style="color:${color}${bold ? ";font-weight:600" : ""}">${s}</span>`;

// Peaceful JSON palette (dark theme).
export const PEACEFUL = {
  bg: "#1e1e1e",
  text: "#dcdcdc",
  key: "#9cdcfe",       // keys — light blue
  string: "#ce9178",    // strings — tan
  url: "#4ec9b0",       // http(s) strings — teal
  email: "#4fc1ff",     // email strings — cyan
  dateUuid: "#dcdcaa",  // ISO date / UUID strings — pale yellow
  int: "#b5cea8",       // integers — light green
  float: "#a8d4a0",     // floats — lighter green
  sci: "#c586c0",       // scientific notation — purple
  boolTrue: "#44dd22",  // true — neon green
  boolFalse: "#ff073a", // false — neon red
  null: "#808080",      // null — grey
  arr: "#ffd700",       // [ ] — gold
  obj: "#da70d6",       // { } — orchid
  tag: "#569cd6",       // XML tag names / SQL keywords — blue
  comment: "#6a9955",   // comments — green
} as const;

const RE_URL = /^https?:\/\//i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringColor(inner: string): string {
  if (RE_URL.test(inner)) return PEACEFUL.url;
  if (RE_EMAIL.test(inner)) return PEACEFUL.email;
  if (RE_UUID.test(inner)) return PEACEFUL.dateUuid;
  if (RE_DATE.test(inner)) return PEACEFUL.dateUuid;
  return PEACEFUL.string;
}

/** JSON → coloured HTML (peaceful palette: keys/strings/numbers/bools/null/brackets). */
export function highlightJson(json: string): string {
  const re = /("(?:\\.|[^\\"])*")(\s*:)?|\b(true)\b|\b(false)\b|\bnull\b|(-?\d+\.?\d*[eE][+-]?\d+)|(-?\d+\.\d+)|(-?\d+)|([[\]])|([{}])/g;
  return esc(json).replace(re, (m, str, colon, t, f, sci, flt, int, arr, obj) => {
    if (str !== undefined) {
      if (colon !== undefined) return span(PEACEFUL.key, str) + colon; // "key":
      return span(stringColor(str.slice(1, -1)), str);
    }
    if (t !== undefined) return span(PEACEFUL.boolTrue, m);
    if (f !== undefined) return span(PEACEFUL.boolFalse, m);
    if (m === "null") return span(PEACEFUL.null, m);
    if (sci !== undefined) return span(PEACEFUL.sci, m);
    if (flt !== undefined) return span(PEACEFUL.float, m);
    if (int !== undefined) return span(PEACEFUL.int, m);
    if (arr !== undefined) return span(PEACEFUL.arr, m);
    if (obj !== undefined) return span(PEACEFUL.obj, m);
    return m;
  });
}

// XML attribute VALUE coloured by the SAME rules as a JSON value ("similar
// things"): numbers → green, true/false → neon, url/email/date/uuid/string → the
// JSON string palette. `val` includes the surrounding quotes.
function xmlValueColor(val: string): string {
  const inner = val.slice(1, -1);
  if (/^-?\d+$/.test(inner)) return PEACEFUL.int;
  if (/^-?\d+\.\d+$/.test(inner)) return PEACEFUL.float;
  if (/^true$/i.test(inner)) return PEACEFUL.boolTrue;
  if (/^false$/i.test(inner)) return PEACEFUL.boolFalse;
  return stringColor(inner);
}

/**
 * XML / BPMN → coloured HTML, modelled on the JSON palette so "similar things"
 * match: a tag ≈ a JSON object → orchid tag name; an attribute name ≈ a JSON key
 * → light blue; an attribute value ≈ a JSON value → type-coloured. Brackets are
 * subtle grey; comments green.
 */
export function highlightXml(xml: string): string {
  return esc(xml)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, (m) => span(PEACEFUL.comment, m))
    .replace(/(&lt;[?!]?\/?)([\w:.-]+)((?:\s+[\w:.-]+(?:="[^"]*")?)*)(\s*[?]?\/?&gt;)/g,
      (_m, open: string, tag: string, attrs: string, close: string) => {
        const a = attrs.replace(/([\w:.-]+)(=)("[^"]*")/g,
          (_x, name: string, eqp: string, val: string) => span(PEACEFUL.key, name) + eqp + span(xmlValueColor(val), val));
        return span(PEACEFUL.null, open) + span(PEACEFUL.obj, tag) + a + span(PEACEFUL.null, close);
      });
}

const SQL_KW = /\b(CREATE|TABLE|VIEW|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|UNIQUE|INDEX|CONSTRAINT|ALTER|ADD|COLUMN|DROP|ON|DELETE|UPDATE|CASCADE|SET|SELECT|FROM|WHERE|AND|OR|AS|WITH|WITHOUT|ZONE|CHECK|GENERATED|ALWAYS|IDENTITY|INT|INTEGER|BIGINT|SMALLINT|SERIAL|BIGSERIAL|VARCHAR|CHAR|TEXT|BOOLEAN|BOOL|TIMESTAMP|TIMESTAMPTZ|DATE|TIME|NUMERIC|DECIMAL|REAL|DOUBLE|PRECISION|JSON|JSONB|UUID|BYTEA)\b/gi;

/** SQL DDL → coloured HTML (keywords/types, strings, comments). */
export function highlightSql(sql: string): string {
  return esc(sql)
    .replace(/(--[^\n]*)/g, (m) => span(PEACEFUL.comment, m))
    .replace(/('(?:[^']|'')*')/g, (m) => span(PEACEFUL.string, m))
    .replace(SQL_KW, (m) => span(PEACEFUL.tag, m, true));
}
