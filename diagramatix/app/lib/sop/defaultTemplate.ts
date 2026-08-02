/**
 * The code-default SOP template: which sections a generated SOP contains, their
 * headings, and per-section guidance for the AI prose pass. Orgs/Projects can
 * override via a `SopTemplate` row (resolution: project → org → this default).
 *
 * The template governs STRUCTURE + guidance; an org's uploaded Word template
 * (SopTemplate.docxTemplate) governs LOOK (fonts/heading styles/header-footer)
 * at export time (style/brand adoption) — the two are independent.
 */
import type { SopScope } from "./skeleton";

export interface SopTemplateSection {
  key: string;
  heading: string;
  guidance: string;
}

export interface SopTemplateSpec {
  name: string;
  sections: SopTemplateSection[];
  boilerplate: string;
  numberingStyle: string;
}

const COMMON_SECTIONS: SopTemplateSection[] = [
  { key: "purpose", heading: "Purpose", guidance: "One short paragraph: why this procedure exists and the outcome it delivers. Ground it in the process owner and (if present) the APQC classification." },
  { key: "scope", heading: "Scope", guidance: "What this SOP covers and its boundaries. State the roles involved and, if scoped to a single role, say so." },
  { key: "roles", heading: "Roles & Responsibilities", guidance: "A bullet per role that appears, summarising what that role is responsible for in this process." },
  { key: "procedure", heading: "Procedure", guidance: "The numbered steps. Use each step's GLOBAL number exactly (do not renumber). For every step name the responsible role and, in plain language, what they do, which systems they use, and which inputs/outputs are involved. Write gateway decisions as 'If <condition>, go to step N; otherwise …'." },
  { key: "inputs_outputs", heading: "Inputs & Outputs", guidance: "Two short lists: the documents/data the process consumes (inputs) and produces (outputs)." },
  { key: "data_objects", heading: "Data Objects", guidance: "Bullet-list the data objects (documents/records) named in 'dataObjects', each with a one-line note of its role in the process where evident. This section is only included when data objects exist." },
  { key: "data_stores", heading: "Data Stores", guidance: "Bullet-list the data stores / repositories named in 'dataStores' (databases, registers, file stores). This section is only included when data stores exist." },
  { key: "systems", heading: "Systems", guidance: "The IT systems used, each named as the actual product." },
  { key: "business_rules", heading: "Business Rules", guidance: "List the business rules that govern this process as bullets. Seed them from 'businessRules' (captured from diagram annotations), lightly cleaned up — do NOT invent rules beyond these. Always include this section; if none were captured, write a single italic line inviting the SOP author to add the applicable business rules." },
  { key: "risks_controls", heading: "Risks & Controls", guidance: "A row per attached risk/control (code — label). Omit the section if none are attached." },
  { key: "related", heading: "Related Processes & Documents", guidance: "Linked subprocess diagrams and parent processes referenced by this one. Omit if none." },
  { key: "revision", heading: "Revision History", guidance: "A single starter row: version, date, 'Generated from BPMN diagram'. Leave author blank for the reviewer to complete." },
];

// A hand-offs section is inserted (after Procedure) only for role-scoped SOPs.
const HANDOFFS_SECTION: SopTemplateSection = {
  key: "handoffs",
  heading: "Hand-offs",
  guidance: "Two lists for this role: 'Receives' — work handed to this role from other roles (name the sending role and what is passed); and 'Hands off' — work this role passes to other roles (name the receiving role and what is passed).",
};

/** The code-default template, tuned slightly by scope (role SOPs get a Hand-offs
 *  section). */
export function defaultSopTemplate(scope: SopScope): SopTemplateSpec {
  const sections = [...COMMON_SECTIONS];
  // Any partial scope (lane / pool / subprocess) has boundary hand-offs to document.
  if (scope === "lane" || scope === "pool" || scope === "subprocess") {
    const at = sections.findIndex((s) => s.key === "procedure");
    sections.splice(at + 1, 0, HANDOFFS_SECTION);
  }
  return {
    name: "Standard SOP",
    sections,
    boilerplate: "",
    numberingStyle: "decimal",
  };
}
