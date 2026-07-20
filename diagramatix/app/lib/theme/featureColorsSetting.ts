/**
 * The app-wide Feature Colours scheme, persisted as a single global AppSetting so
 * a SuperAdmin can refine it (in "Feature Colours") without a deploy. Reads always
 * return a full, valid, defaulted scheme — falling back to the built-in palette
 * when unset, malformed, or on a DB hiccup.
 */
import { prisma } from "@/app/lib/db";
import {
  DEFAULT_FEATURE_SCHEME, resolveFeatureScheme, type FeatureColorScheme,
} from "@/app/lib/theme/featureColors";

export const FEATURE_COLORS_KEY = "feature.colors";

/** The current scheme (validated, complete, defaulted). */
export async function getFeatureColors(): Promise<FeatureColorScheme> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: FEATURE_COLORS_KEY } });
    const parsed = row?.value ? JSON.parse(row.value) : null;
    return resolveFeatureScheme(parsed);
  } catch {
    return DEFAULT_FEATURE_SCHEME; // never block a render
  }
}

/** Persist a (possibly partial) scheme; stores the normalised full scheme. */
export async function setFeatureColors(input: unknown): Promise<FeatureColorScheme> {
  const scheme = resolveFeatureScheme(input);
  const value = JSON.stringify(scheme);
  await prisma.appSetting.upsert({
    where: { key: FEATURE_COLORS_KEY },
    create: { key: FEATURE_COLORS_KEY, value },
    update: { value },
  });
  return scheme;
}
