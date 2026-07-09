/**
 * The APQC PCF level colour scheme, persisted as a single global AppSetting so a
 * SuperAdmin can refine it (in "APQC PCF Hierarchy Colour Maintenance") without a
 * deploy. Reads always return a full, valid 5-level scheme — falling back to the
 * built-in defaults when unset, malformed, or on a DB hiccup.
 */
import { prisma } from "@/app/lib/db";
import { DEFAULT_PCF_LEVEL_COLORS, normalizeScheme, type PcfLevelColor } from "./levelColors";

export const PCF_COLORS_KEY = "pcf.level.colors";

/** The current level colour scheme (validated, complete, defaulted). */
export async function getPcfLevelColors(): Promise<PcfLevelColor[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PCF_COLORS_KEY } });
    const parsed = row?.value ? JSON.parse(row.value) : null;
    return normalizeScheme(parsed);
  } catch {
    return [...DEFAULT_PCF_LEVEL_COLORS]; // never block a hierarchy render
  }
}

/** Persist a (possibly partial) scheme; stores the normalised full scheme. */
export async function setPcfLevelColors(input: unknown): Promise<PcfLevelColor[]> {
  const scheme = normalizeScheme(input);
  const value = JSON.stringify(scheme);
  await prisma.appSetting.upsert({
    where: { key: PCF_COLORS_KEY },
    create: { key: PCF_COLORS_KEY, value },
    update: { value },
  });
  return scheme;
}
