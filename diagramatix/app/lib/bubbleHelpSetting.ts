/**
 * Global Bubble Help master switch, persisted as a single AppSetting so a
 * SuperAdmin can turn the feature on/off for EVERYONE without a deploy.
 *
 * Default is OFF (unset ⇒ false): Bubble Help is off everywhere until a SuperAdmin
 * turns it back on. The per-user localStorage preference on the canvas is
 * subordinate — bubbles only ever show when this global switch is on.
 */
import { prisma } from "@/app/lib/db";

export const BUBBLE_HELP_ENABLED_KEY = "bubbleHelp.enabled";

/** Whether Bubble Help is globally enabled. Never throws — defaults to OFF. */
export async function getBubbleHelpEnabled(): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: BUBBLE_HELP_ENABLED_KEY } });
    return row?.value === "true"; // unset / anything else ⇒ off everywhere
  } catch {
    return false;
  }
}

/** Set the global Bubble Help switch (SuperAdmin only — enforced by the route). */
export async function setBubbleHelpEnabled(enabled: boolean): Promise<void> {
  const value = enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: BUBBLE_HELP_ENABLED_KEY },
    create: { key: BUBBLE_HELP_ENABLED_KEY, value },
    update: { value },
  });
}
