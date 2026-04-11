/**
 * Generate the Diagramatix relational DDL for PostgreSQL, MySQL, or SQL Server.
 * Produces the full schema from scratch — no JSON columns.
 */

import { SCHEMA_VERSION } from "./types";

type Dialect = "postgres" | "mysql" | "mssql";

interface Column {
  name: string;
  type: Record<Dialect, string>;
  pk?: boolean;
  nn?: boolean;       // NOT NULL
  unique?: boolean;
  default?: Record<Dialect, string>;
  fk?: { table: string; column: string; onDelete?: string };
  identity?: boolean; // auto-increment
}

interface Table {
  name: string;
  columns: Column[];
  compositePK?: string[]; // for composite primary keys
  uniqueConstraints?: string[][];
  indexes?: { name: string; columns: string[] }[];
}

interface RefTable {
  name: string;
  values: string[];
}

// ── Type helpers ────────────────────────────────────────────────────

const T = {
  text:     { postgres: "TEXT",        mysql: "VARCHAR(255)", mssql: "NVARCHAR(255)" },
  longtext: { postgres: "TEXT",        mysql: "TEXT",         mssql: "NVARCHAR(MAX)" },
  bool:     { postgres: "BOOLEAN",     mysql: "TINYINT(1)",   mssql: "BIT" },
  int:      { postgres: "INT",         mysql: "INT",          mssql: "INT" },
  bigserial:{ postgres: "BIGSERIAL",   mysql: "BIGINT AUTO_INCREMENT", mssql: "BIGINT IDENTITY(1,1)" },
  numeric:  { postgres: "NUMERIC",     mysql: "DECIMAL(18,6)",mssql: "DECIMAL(18,6)" },
  ts:       { postgres: "TIMESTAMPTZ", mysql: "DATETIME",     mssql: "DATETIME2" },
};

// ── Reference tables ────────────────────────────────────────────────

const refs: RefTable[] = [
  { name: "ref_org_entity_type", values: ["ADI","Insurer","LifeInsurer","HealthInsurer","RSE","Other"] },
  { name: "ref_org_role", values: ["Owner","Admin","RiskOwner","ProcessOwner","ControlOwner","InternalAudit","BoardObserver","Viewer"] },
  { name: "ref_diagram_type", values: ["context","basic","process-context","state-machine","bpmn","domain","value-chain"] },
  { name: "ref_symbol_type", values: ["task","gateway","start-event","intermediate-event","end-event","use-case","actor","team","state","initial-state","final-state","pool","lane","subprocess","subprocess-expanded","system-boundary","system-boundary-body","hourglass","composite-state","composite-state-body","system","data-object","data-store","group","text-annotation","external-entity","process-system","uml-class","uml-enumeration","sublane","fork-join","submachine","chevron","chevron-collapsed","process-group"] },
  { name: "ref_bpmn_task_type", values: ["none","user","service","script","send","receive","manual","business-rule"] },
  { name: "ref_gateway_type", values: ["none","exclusive","inclusive","parallel","event-based"] },
  { name: "ref_gateway_role", values: ["decision","merge"] },
  { name: "ref_event_type", values: ["none","message","timer","error","signal","terminate","conditional","escalation","cancel","compensation","link"] },
  { name: "ref_repeat_type", values: ["none","loop","mi-sequential","mi-parallel"] },
  { name: "ref_flow_type", values: ["none","catching","throwing"] },
  { name: "ref_connector_type", values: ["sequence","message","association","transition","associationBPMN","messageBPMN","flow","uml-association","uml-aggregation","uml-composition","uml-generalisation"] },
  { name: "ref_side", values: ["top","right","bottom","left"] },
  { name: "ref_direction_type", values: ["directed","non-directed","open-directed","both"] },
  { name: "ref_routing_type", values: ["direct","rectilinear","curvilinear"] },
  { name: "ref_diagram_status", values: ["draft","final","production"] },
  { name: "ref_display_mode", values: ["normal","hand-drawn"] },
  { name: "ref_label_anchor", values: ["midpoint","source"] },
  { name: "ref_label_mode", values: ["informal","formal"] },
  { name: "ref_reading_direction", values: ["none","to-source","to-target"] },
  { name: "ref_pool_type", values: ["black-box","white-box"] },
  { name: "ref_subprocess_type", values: ["normal","call","event","transaction"] },
  { name: "ref_interruption_type", values: ["interrupting","non-interrupting"] },
  { name: "ref_annotation_color", values: ["black","green","orange","red","purple"] },
  { name: "ref_annotation_font_style", values: ["normal","italic"] },
  { name: "ref_value_analysis", values: ["none","VA","NNVA","NVA"] },
  { name: "ref_time_unit", values: ["none","sec","min","hrs","days","other"] },
  { name: "ref_uml_visibility", values: ["+","-","#"] },
  { name: "ref_data_role", values: ["none","input","output"] },
  { name: "ref_data_multiplicity", values: ["single","collection"] },
];

// ── Entity tables ───────────────────────────────────────────────────

function c(name: string, type: Record<Dialect, string>, opts?: Partial<Column>): Column {
  return { name, type, ...opts };
}

const fk = (table: string, column = "id", onDelete?: string) => ({ table, column, onDelete });
const pk = { pk: true, nn: true } as const;
const nn = { nn: true } as const;
const refFk = (refTable: string) => ({ fk: { table: refTable, column: "code" } });

const entityTables: Table[] = [
  { name: "org", columns: [
    c("id", T.text, pk), c("name", T.text, nn),
    c("entity_type", T.text, { nn: true, default: { postgres: "'Other'", mysql: "'Other'", mssql: "'Other'" }, ...refFk("ref_org_entity_type") }),
    c("created_at", T.ts, { nn: true }),
  ]},
  { name: "app_user", columns: [
    c("id", T.text, pk), c("email", T.text, { nn: true, unique: true }),
    c("name", T.text), c("password", T.text, { nn: true }),
    c("reset_token", T.text, { unique: true }), c("reset_token_expiry", T.ts),
    c("created_at", T.ts, { nn: true }),
  ]},
  { name: "org_member", columns: [
    c("id", T.text, pk),
    c("org_id", T.text, { nn: true, fk: fk("org", "id", "CASCADE") }),
    c("user_id", T.text, { nn: true, fk: fk("app_user", "id", "CASCADE") }),
    c("role", T.text, { nn: true, ...refFk("ref_org_role") }),
    c("created_at", T.ts, { nn: true }),
  ], uniqueConstraints: [["org_id", "user_id"]], indexes: [{ name: "idx_org_member_user", columns: ["user_id"] }] },
  { name: "project", columns: [
    c("id", T.text, pk), c("name", T.text, nn), c("description", T.text, nn), c("owner_name", T.text, nn),
    c("user_id", T.text, { nn: true, fk: fk("app_user", "id", "CASCADE") }),
    c("org_id", T.text, { nn: true, fk: fk("org", "id", "RESTRICT") }),
    c("created_at", T.ts, nn), c("updated_at", T.ts, nn),
  ], indexes: [{ name: "idx_project_org", columns: ["org_id"] }] },
  { name: "diagram", columns: [
    c("id", T.text, pk), c("name", T.text, nn),
    c("type", T.text, { nn: true, ...refFk("ref_diagram_type") }),
    c("display_mode", T.text, { nn: true, ...refFk("ref_display_mode") }),
    c("user_id", T.text, { nn: true, fk: fk("app_user", "id", "CASCADE") }),
    c("project_id", T.text, { fk: fk("project", "id", "SET NULL") }),
    c("org_id", T.text, { nn: true, fk: fk("org", "id", "RESTRICT") }),
    c("created_at", T.ts, nn), c("updated_at", T.ts, nn),
  ], indexes: [{ name: "idx_diagram_org", columns: ["org_id"] }] },
  { name: "diagram_template", columns: [
    c("id", T.text, pk), c("name", T.text, nn),
    c("diagram_type", T.text, { nn: true, ...refFk("ref_diagram_type") }),
    c("template_type", T.text, nn),
    c("user_id", T.text, { nn: true, fk: fk("app_user", "id", "CASCADE") }),
    c("created_at", T.ts, nn), c("updated_at", T.ts, nn),
  ]},
  { name: "diagram_settings", columns: [
    c("diagram_id", T.text, { pk: true, nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("viewport_x", T.numeric, nn), c("viewport_y", T.numeric, nn), c("viewport_zoom", T.numeric, nn),
    c("font_size", T.numeric), c("connector_font_size", T.numeric), c("title_font_size", T.numeric),
  ]},
  { name: "diagram_title", columns: [
    c("diagram_id", T.text, { pk: true, nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("version", T.text), c("authors", T.text),
    c("status", T.text, refFk("ref_diagram_status")),
    c("show_title", T.bool),
  ]},
  { name: "element", columns: [
    c("id", T.text, pk),
    c("diagram_id", T.text, { nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("type", T.text, { nn: true, ...refFk("ref_symbol_type") }),
    c("x", T.numeric, nn), c("y", T.numeric, nn), c("width", T.numeric, nn), c("height", T.numeric, nn),
    c("label", T.text, nn),
    c("parent_id", T.text), c("boundary_host_id", T.text),
    c("task_type", T.text, refFk("ref_bpmn_task_type")),
    c("gateway_type", T.text, refFk("ref_gateway_type")),
    c("event_type", T.text, refFk("ref_event_type")),
    c("repeat_type", T.text, refFk("ref_repeat_type")),
    c("flow_type", T.text, refFk("ref_flow_type")),
    c("gateway_role", T.text, refFk("ref_gateway_role")),
    c("pool_type", T.text, refFk("ref_pool_type")),
    c("subprocess_type", T.text, refFk("ref_subprocess_type")),
    c("interruption_type", T.text, refFk("ref_interruption_type")),
    c("ad_hoc", T.bool),
    c("linked_diagram_id", T.text),
    c("data_role", T.text, refFk("ref_data_role")),
    c("data_multiplicity", T.text, refFk("ref_data_multiplicity")),
    c("data_state", T.text),
    c("label_offset_x", T.numeric), c("label_offset_y", T.numeric), c("label_width", T.numeric),
    c("value_analysis", T.text, refFk("ref_value_analysis")),
    c("cycle_time", T.numeric), c("wait_time", T.numeric),
    c("time_unit", T.text, refFk("ref_time_unit")), c("time_unit_custom", T.text),
    c("annotation_color", T.text, refFk("ref_annotation_color")),
    c("annotation_font_style", T.text, refFk("ref_annotation_font_style")),
    c("stereotype", T.text), c("show_stereotype", T.bool),
    c("show_attributes", T.bool), c("show_operations", T.bool),
    c("fill_color", T.text), c("description", T.longtext), c("show_description", T.bool),
  ], indexes: [{ name: "idx_element_diagram", columns: ["diagram_id"] }] },
  { name: "uml_attribute", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("element_id", T.text, { nn: true, fk: fk("element", "id", "CASCADE") }),
    c("ordinal", T.int, nn), c("visibility", T.text, refFk("ref_uml_visibility")),
    c("name", T.text, nn), c("type", T.text), c("multiplicity", T.text),
    c("default_value", T.text), c("property_string", T.text), c("is_derived", T.bool),
  ], indexes: [{ name: "idx_uml_attr_element", columns: ["element_id"] }] },
  { name: "uml_operation", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("element_id", T.text, { nn: true, fk: fk("element", "id", "CASCADE") }),
    c("ordinal", T.int, nn), c("visibility", T.text, refFk("ref_uml_visibility")),
    c("name", T.text, nn),
  ], indexes: [{ name: "idx_uml_op_element", columns: ["element_id"] }] },
  { name: "uml_enum_value", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("element_id", T.text, { nn: true, fk: fk("element", "id", "CASCADE") }),
    c("ordinal", T.int, nn), c("value", T.text, nn),
  ], indexes: [{ name: "idx_uml_enum_element", columns: ["element_id"] }] },
  { name: "connector", columns: [
    c("id", T.text, pk),
    c("diagram_id", T.text, { nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("source_id", T.text, { nn: true, fk: fk("element", "id", "CASCADE") }),
    c("target_id", T.text, { nn: true, fk: fk("element", "id", "CASCADE") }),
    c("type", T.text, { nn: true, ...refFk("ref_connector_type") }),
    c("direction_type", T.text, { nn: true, ...refFk("ref_direction_type") }),
    c("routing_type", T.text, { nn: true, ...refFk("ref_routing_type") }),
    c("source_side", T.text, { nn: true, ...refFk("ref_side") }),
    c("target_side", T.text, { nn: true, ...refFk("ref_side") }),
    c("source_invisible_leader", T.bool, nn), c("target_invisible_leader", T.bool, nn),
    c("source_offset_along", T.numeric), c("target_offset_along", T.numeric),
    c("cp1_rel_offset_x", T.numeric), c("cp1_rel_offset_y", T.numeric),
    c("cp2_rel_offset_x", T.numeric), c("cp2_rel_offset_y", T.numeric),
    c("label", T.text), c("label_offset_x", T.numeric), c("label_offset_y", T.numeric),
    c("label_width", T.numeric), c("label_anchor", T.text, refFk("ref_label_anchor")),
    c("label_mode", T.text, refFk("ref_label_mode")),
    c("transition_event", T.text), c("transition_guard", T.text), c("transition_actions", T.text),
    c("source_role", T.text), c("source_multiplicity", T.text),
    c("target_role", T.text), c("target_multiplicity", T.text),
    c("association_name", T.text),
    c("reading_direction", T.text, refFk("ref_reading_direction")),
    c("bottleneck", T.bool),
  ], indexes: [{ name: "idx_connector_diagram", columns: ["diagram_id"] }] },
  { name: "connector_waypoint", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("connector_id", T.text, { nn: true, fk: fk("connector", "id", "CASCADE") }),
    c("ordinal", T.int, nn), c("x", T.numeric, nn), c("y", T.numeric, nn),
  ], indexes: [{ name: "idx_wp_connector", columns: ["connector_id"] }] },
  { name: "project_color", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("project_id", T.text, { nn: true, fk: fk("project", "id", "CASCADE") }),
    c("symbol_type", T.text, { nn: true, ...refFk("ref_symbol_type") }),
    c("color", T.text, nn),
  ], uniqueConstraints: [["project_id", "symbol_type"]] },
  { name: "diagram_color", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("diagram_id", T.text, { nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("symbol_type", T.text, { nn: true, ...refFk("ref_symbol_type") }),
    c("color", T.text, nn),
  ], uniqueConstraints: [["diagram_id", "symbol_type"]] },
  { name: "project_folder", columns: [
    c("id", T.text, nn), c("project_id", T.text, { nn: true, fk: fk("project", "id", "CASCADE") }),
    c("name", T.text, nn), c("parent_id", T.text),
    c("collapsed", T.bool), c("ordinal", T.int),
  ], compositePK: ["project_id", "id"] },
  { name: "diagram_folder_map", columns: [
    c("diagram_id", T.text, { pk: true, nn: true, fk: fk("diagram", "id", "CASCADE") }),
    c("project_id", T.text, { nn: true, fk: fk("project", "id", "CASCADE") }),
    c("folder_id", T.text, nn), c("ordinal", T.int),
  ]},
  { name: "template_element", columns: [
    c("id", T.text, pk),
    c("template_id", T.text, { nn: true, fk: fk("diagram_template", "id", "CASCADE") }),
    c("type", T.text, { nn: true, ...refFk("ref_symbol_type") }),
    c("x", T.numeric, nn), c("y", T.numeric, nn), c("width", T.numeric, nn), c("height", T.numeric, nn),
    c("label", T.text, nn),
  ], indexes: [{ name: "idx_tmpl_el_template", columns: ["template_id"] }] },
  { name: "template_connector", columns: [
    c("id", T.text, pk),
    c("template_id", T.text, { nn: true, fk: fk("diagram_template", "id", "CASCADE") }),
    c("source_id", T.text, { nn: true, fk: fk("template_element", "id", "CASCADE") }),
    c("target_id", T.text, { nn: true, fk: fk("template_element", "id", "CASCADE") }),
    c("type", T.text, { nn: true, ...refFk("ref_connector_type") }),
  ], indexes: [{ name: "idx_tmpl_conn_template", columns: ["template_id"] }] },
  { name: "template_connector_waypoint", columns: [
    c("id", T.bigserial, { pk: true, nn: true, identity: true }),
    c("connector_id", T.text, { nn: true, fk: fk("template_connector", "id", "CASCADE") }),
    c("ordinal", T.int, nn), c("x", T.numeric, nn), c("y", T.numeric, nn),
  ], indexes: [{ name: "idx_tmpl_wp_connector", columns: ["connector_id"] }] },
];

// ── DDL Generator ───────────────────────────────────────────────────

function q(id: string, d: Dialect): string {
  if (d === "mssql") return `[${id}]`;
  if (d === "mysql") return `\`${id}\``;
  return `"${id}"`;
}

function colDef(col: Column, d: Dialect, skipPK = false): string {
  let s = `    ${col.name.padEnd(28)} ${col.type[d]}`;
  if (col.nn) s += " NOT NULL";
  if (col.pk && !skipPK) s += " PRIMARY KEY";
  if (col.unique) s += " UNIQUE";
  if (col.default) s += ` DEFAULT ${col.default[d]}`;
  if (col.fk) s += `\n${"".padEnd(32)}REFERENCES ${col.fk.table}(${col.fk.column})${col.fk.onDelete ? " ON DELETE " + col.fk.onDelete : ""}`;
  return s;
}

function colDefMysql(col: Column, skipPK = false): string {
  let type = col.type.mysql;
  // MySQL: BIGSERIAL → BIGINT AUTO_INCREMENT (already in type)
  let s = `    ${col.name.padEnd(28)} ${type}`;
  if (col.nn) s += " NOT NULL";
  if (col.pk && !skipPK) s += " PRIMARY KEY";
  if (col.unique) s += " UNIQUE";
  if (col.default) s += ` DEFAULT ${col.default.mysql}`;
  return s;
}

function colDefMssql(col: Column, skipPK = false): string {
  let type = col.type.mssql;
  let s = `    [${col.name}]`.padEnd(32) + ` ${type}`;
  if (col.nn) s += " NOT NULL";
  if (col.pk && !skipPK) s += " PRIMARY KEY";
  if (col.unique) s += " UNIQUE";
  if (col.default) s += ` DEFAULT ${col.default.mssql}`;
  return s;
}

export function generateDiagramatixDDL(dbType: string): string {
  const d = dbType as Dialect;
  const dbLabel = { postgres: "PostgreSQL", mysql: "MySQL", mssql: "SQL Server" }[d] ?? d;
  const lines: string[] = [];
  const sep = d === "mssql" ? "GO" : "";
  const term = d === "mssql" ? "" : ";";

  lines.push(`-- ============================================================================`);
  lines.push(`-- Diagramatix Relational Database Schema (DDL)`);
  lines.push(`-- Schema Version: ${SCHEMA_VERSION}`);
  lines.push(`-- Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`-- Dialect: ${dbLabel}`);
  lines.push(`-- ============================================================================`);
  lines.push("");

  // Reference tables
  lines.push(`-- REFERENCE / LOOKUP TABLES`);
  lines.push("");
  for (const ref of refs) {
    if (d === "mysql") {
      lines.push(`CREATE TABLE ${ref.name} (`);
      lines.push(`    code VARCHAR(60) PRIMARY KEY`);
      lines.push(`)${term}`);
    } else if (d === "mssql") {
      lines.push(`CREATE TABLE [${ref.name}] (`);
      lines.push(`    [code] NVARCHAR(60) PRIMARY KEY`);
      lines.push(`)`);
      lines.push(sep);
    } else {
      lines.push(`CREATE TABLE ${ref.name} (`);
      lines.push(`    code TEXT PRIMARY KEY`);
      lines.push(`)${term}`);
    }
    // INSERT values
    const vals = ref.values.map(v => `('${v.replace(/'/g, "''")}')`).join(",\n    ");
    if (d === "mssql") {
      lines.push(`INSERT INTO [${ref.name}] (code) VALUES`);
    } else {
      lines.push(`INSERT INTO ${ref.name} (code) VALUES`);
    }
    lines.push(`    ${vals}${term}`);
    if (sep) lines.push(sep);
    lines.push("");
  }

  // Entity tables
  lines.push(`-- ENTITY TABLES`);
  lines.push("");
  for (const table of entityTables) {
    const hasCPK = table.compositePK && table.compositePK.length > 0;
    const colLines: string[] = [];

    for (const col of table.columns) {
      if (d === "mysql") colLines.push(colDefMysql(col, hasCPK));
      else if (d === "mssql") colLines.push(colDefMssql(col, hasCPK));
      else colLines.push(colDef(col, d, hasCPK));
    }

    // MySQL: FK as table-level constraints (can't inline REFERENCES reliably)
    if (d === "mysql") {
      for (const col of table.columns) {
        if (col.fk) {
          colLines.push(`    FOREIGN KEY (${col.name}) REFERENCES ${col.fk.table}(${col.fk.column})${col.fk.onDelete ? " ON DELETE " + col.fk.onDelete : ""}`);
        }
      }
    }

    if (hasCPK) {
      colLines.push(`    PRIMARY KEY (${table.compositePK!.join(", ")})`);
    }
    if (table.uniqueConstraints) {
      for (const uc of table.uniqueConstraints) {
        colLines.push(`    UNIQUE (${uc.join(", ")})`);
      }
    }

    if (d === "mssql") {
      lines.push(`CREATE TABLE [${table.name}] (`);
    } else {
      lines.push(`CREATE TABLE ${table.name} (`);
    }
    lines.push(colLines.join(",\n"));
    lines.push(`)${term}`);
    if (sep) lines.push(sep);

    // Indexes
    if (table.indexes) {
      for (const idx of table.indexes) {
        if (d === "mssql") {
          lines.push(`CREATE INDEX [${idx.name}] ON [${table.name}](${idx.columns.map(c => `[${c}]`).join(", ")})${term}`);
        } else {
          lines.push(`CREATE INDEX ${idx.name} ON ${table.name}(${idx.columns.join(", ")})${term}`);
        }
      }
    }
    if (sep && table.indexes?.length) lines.push(sep);
    lines.push("");
  }

  // Deferred self-referential FKs for element table
  lines.push(`-- Deferred self-referential foreign keys`);
  if (d === "mssql") {
    lines.push(`ALTER TABLE [element] ADD CONSTRAINT fk_element_parent FOREIGN KEY (parent_id) REFERENCES [element]([id]) ON DELETE NO ACTION`);
    lines.push(sep);
    lines.push(`ALTER TABLE [element] ADD CONSTRAINT fk_element_boundary FOREIGN KEY (boundary_host_id) REFERENCES [element]([id]) ON DELETE CASCADE`);
    lines.push(sep);
    lines.push(`ALTER TABLE [element] ADD CONSTRAINT fk_element_linked FOREIGN KEY (linked_diagram_id) REFERENCES [diagram]([id]) ON DELETE NO ACTION`);
    lines.push(sep);
  } else {
    lines.push(`ALTER TABLE element ADD CONSTRAINT fk_element_parent FOREIGN KEY (parent_id) REFERENCES element(id) ON DELETE SET NULL${term}`);
    lines.push(`ALTER TABLE element ADD CONSTRAINT fk_element_boundary FOREIGN KEY (boundary_host_id) REFERENCES element(id) ON DELETE CASCADE${term}`);
    lines.push(`ALTER TABLE element ADD CONSTRAINT fk_element_linked FOREIGN KEY (linked_diagram_id) REFERENCES diagram(id) ON DELETE SET NULL${term}`);
  }
  lines.push("");

  lines.push(`-- Schema version: ${SCHEMA_VERSION}`);
  lines.push(`-- End of DDL`);

  return lines.join("\n");
}
