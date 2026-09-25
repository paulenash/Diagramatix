/**
 * The built-in template library, read from the seed file the database is
 * filled from (scripts/seed-builtin-templates.sql) — so a test attaches the
 * templates Paul actually picks from, not a hand-made stand-in. No database.
 */
import { readFileSync } from "node:fs";
import type { TemplateData } from "@/app/lib/diagram/types";

export interface BuiltinTemplate { name: string; group: string; data: TemplateData }

let cache: BuiltinTemplate[] | null = null;

export function builtinTemplates(): BuiltinTemplate[] {
  if (cache) return cache;
  const sql = readFileSync("scripts/seed-builtin-templates.sql", "utf8");
  const rows: BuiltinTemplate[] = [];
  const re = /gen_random_uuid\(\)::text, \$TN\$(.*?)\$TN\$, 'bpmn', 'builtin', \$TG\$(.*?)\$TG\$[\s\S]*?\$TJ\$([\s\S]*?)\$TJ\$/g;
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    rows.push({ name: m[1], group: m[2], data: JSON.parse(m[3]) as TemplateData });
  }
  cache = rows;
  return rows;
}

export function builtinTemplate(name: string): TemplateData {
  const t = builtinTemplates().find((r) => r.name === name);
  if (!t) throw new Error(`no built-in template called ${name}`);
  return t.data;
}
