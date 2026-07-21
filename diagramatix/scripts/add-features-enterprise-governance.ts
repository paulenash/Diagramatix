/**
 * Feature-catalog entry for **Enterprise Governance & Security** — the per-tenant
 * controls, data-egress governance and audit trail an enterprise buyer needs.
 *
 * LIVING ENTRY: unlike the other add-features-*.ts scripts (which skip if the row
 * exists), this one UPSERTS the DRAFT fields on every run, so the summary/details
 * stay current as the enterprise-readiness programme progresses (see
 * diagramatix/enterprise/). It only ever touches the DRAFT columns — the public
 * /features page shows the last PUBLISHED snapshot, so re-running never changes
 * marketing copy until a SuperAdmin reviews it in /dashboard/admin/features and
 * hits Publish.
 *
 * Run:
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-features-enterprise-governance.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const NAME = "Enterprise Governance & Security";
const SORT_ORDER = 250;
const SUMMARY =
  "Give large organisations strict, per-tenant control over where their process information can go — and whether, and how, AI is used — with a full audit trail of privileged access.";
const DETAILS = [
  "**Your policy, enforced by us.** Your own OrgAdmins control an **Organisation Policy** panel — turn each capability on or off for your whole organisation, and the platform enforces it (not just the UI):",
  "- **AI features** — disable all AI generation, or keep it on",
  "- **Voice transcription** — disable sending audio to the speech-to-text provider",
  "- **External export** — block pushing data out to SharePoint / OneDrive",
  "- **SharePoint integration** — disable the connector entirely",
  "- **Support attachments** — stop diagrams being attached to support requests",
  "",
  "**Enterprise Mode** — one click turns all of the above off (plus cross-organisation sharing), as a safe default for regulated tenants.",
  "",
  "**AI on your terms.** Route all AI through your own gateway/region, run a **local model fully on-premises**, or switch AI off completely for your tenant — AI uses a single, centrally-chosen model you approve. (See the *Flexible AI* feature for the deployment options.)",
  "",
  "**Accountability.** An append-only **Audit Log** records every privileged action — administrator impersonation (with a required reason and a time-boxed session), data exports and backups, deletions and policy changes — so you can see who did what, when, to which tenant.",
  "",
  "**Access & isolation.** Role-scoped administration (Organisation Admin vs system operator), tenant-isolated data, cross-organisation sharing off by default, a configurable session lifetime, and the option to **require Microsoft single sign-on** for your organisation (plus a self-registration domain allowlist).",
  "",
  "**Privacy.** Self-service **account deletion** (right to erasure) that removes your data and cleans up behind you; AI prompt text isn't retained by default.",
  "",
  "*On the roadmap:* bring-your-own IdP (SAML / OIDC) with MFA, dedicated single-tenant / in-region instances, and SOC 2 Type II.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const existing = await prisma.feature.findFirst({ where: { name: NAME } });
    if (existing) {
      await prisma.feature.update({
        where: { id: existing.id },
        data: { name: NAME, summary: SUMMARY, details: DETAILS, sortOrder: SORT_ORDER },
      });
      console.log(`Updated draft "${NAME}" (sortOrder=${SORT_ORDER}). Review + Publish in /dashboard/admin/features.`);
    } else {
      await prisma.feature.create({
        data: { name: NAME, summary: SUMMARY, details: DETAILS, sortOrder: SORT_ORDER },
      });
      console.log(`Added draft "${NAME}" (sortOrder=${SORT_ORDER}, unpublished).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
