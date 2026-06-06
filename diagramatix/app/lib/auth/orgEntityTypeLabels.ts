/**
 * Client-safe display labels for the Prisma OrgEntityType enum.
 *
 * The Prisma enum values are short keys (ADI / Insurer / LifeInsurer
 * / HealthInsurer / RSE / Other). Diagramatix is targeted at the
 * Australian financial-services regulatory environment, so the label
 * spells out what each acronym means — saves admins from having to
 * remember which is which.
 *
 * Lives in its own file (no DB imports) so client components can
 * import directly. Order in ORG_ENTITY_TYPE_OPTIONS drives the
 * dropdown order.
 */

import type { OrgEntityType } from "@/app/generated/prisma/enums";

export const ORG_ENTITY_TYPE_LABELS: Record<OrgEntityType, string> = {
  ADI: "ADI (Authorised Deposit-Taking Institution)",
  Insurer: "General Insurer",
  LifeInsurer: "Life Insurer",
  HealthInsurer: "Health Insurer",
  RSE: "RSE (Superannuation)",
  Other: "Other",
};

/** Picker order — regulated entities first (most specific), Other last. */
export const ORG_ENTITY_TYPE_OPTIONS: OrgEntityType[] = [
  "ADI",
  "Insurer",
  "LifeInsurer",
  "HealthInsurer",
  "RSE",
  "Other",
];
