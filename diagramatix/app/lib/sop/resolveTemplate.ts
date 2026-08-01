/**
 * Server-only SOP template resolution: project row → org row → code default.
 * Returns the section spec (for the AI prose pass) plus whether an uploaded Word
 * template exists (its bytes are loaded lazily by the export route, by id).
 */
import { prisma } from "@/app/lib/db";
import { defaultSopTemplate, type SopTemplateSpec, type SopTemplateSection } from "./defaultTemplate";
import type { SopScope } from "./skeleton";

export interface ResolvedSopTemplate {
  templateId: string | null;
  spec: SopTemplateSpec;
  hasDocx: boolean;
}

export async function resolveSopTemplate(opts: {
  projectId: string;
  orgId: string;
  scope: SopScope;
}): Promise<ResolvedSopTemplate> {
  const def = defaultSopTemplate(opts.scope);

  // Project override wins; else the org's default (or newest) template.
  let row = await prisma.sopTemplate.findFirst({
    where: { projectId: opts.projectId },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) {
    row = await prisma.sopTemplate.findFirst({ where: { orgId: opts.orgId, isDefault: true } });
  }
  if (!row) {
    row = await prisma.sopTemplate.findFirst({ where: { orgId: opts.orgId }, orderBy: { updatedAt: "desc" } });
  }
  if (!row) return { templateId: null, spec: def, hasDocx: false };

  const stored = row.sections as unknown;
  const sections: SopTemplateSection[] =
    Array.isArray(stored) && stored.length > 0 ? (stored as SopTemplateSection[]) : def.sections;

  return {
    templateId: row.id,
    spec: { name: row.name, sections, boilerplate: row.boilerplate, numberingStyle: row.numberingStyle },
    hasDocx: !!row.docxTemplate,
  };
}
