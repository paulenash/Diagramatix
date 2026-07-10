/**
 * Parse any supported event-log text (CSV/TSV, IEEE XES, OCEL JSON or OCEL 2.0
 * XML) into the uniform { headers, rows, mapping } table the mining pipeline
 * consumes. Factored from ProcessMiningConsole.onFile so both the interactive
 * importer and the server-side pull connectors (Azure Blob / SharePoint) share
 * one parser.
 */
import { parseCsv, guessMapping } from "./parseEventLog";
import { parseXes } from "./formats/xes";
import { parseOcel } from "./formats/ocel";
import type { LogMapping } from "./types";

export interface ParsedAnyLog {
  headers: string[];
  rows: string[][];
  mapping: Partial<LogMapping>;
  note?: string;
}

export function parseAnyLog(text: string, filename = ""): ParsedAnyLog {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // OCEL 2.0 XML and XES both look like <?xml/<log; distinguish by OCEL markers.
  const isXml = /^<\?xml|^<log[\s>]/.test(text.trimStart());
  const isOcelXml = isXml && /<object-types|<objects>/.test(text.slice(0, 30_000));
  if (!isOcelXml && (ext === "xes" || isXml)) {
    const p = parseXes(text);
    return { headers: p.headers, rows: p.rows, mapping: p.mapping };
  }
  if (ext === "json" || ext === "ocel" || ext === "jsonocel" || ext === "xml" || isOcelXml || /^\s*\{/.test(text)) {
    const p = parseOcel(text);
    return {
      headers: p.headers, rows: p.rows, mapping: p.mapping,
      note: p.objectTypes.length > 1 ? `OCEL: projected on object type “${p.chosenType}” (${p.objectTypes.length} types present).` : undefined,
    };
  }
  const csv = parseCsv(text);
  return { headers: csv.headers, rows: csv.rows, mapping: guessMapping(csv.headers) };
}
