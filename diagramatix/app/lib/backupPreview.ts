/**
 * Pre-flight backup previews: cheap COUNT queries that tell the user (and
 * the selection UI) what a backup WILL contain before it's built. Returned
 * by the `?preview=1` mode of the three backup endpoints.
 */
import { prisma } from "./db";
import { ARCHIVE_PROJECT_NAME } from "./archive";
import { getBackupSchema, delegateName } from "./backupSchema";

export interface BackupSection {
  label: string;
  count: number;
}
export interface PreviewUser {
  userId: string;
  email: string;
  name: string | null;
  projects: number;
  diagrams: number;
}
export interface PreviewOrg {
  orgId: string;
  name: string;
  users: PreviewUser[];
}
export interface BackupPreview {
  scope: "user" | "org" | "full";
  /** Headline counts shown as the stats table. */
  sections: BackupSection[];
  /** What the picker offers. */
  selectable: "none" | "users" | "orgs";
  users?: PreviewUser[]; // org scope
  orgs?: PreviewOrg[]; // full scope
}

export async function previewUserBackup(userId: string): Promise<BackupPreview> {
  const [projects, diagrams, templates, prompts] = await Promise.all([
    prisma.project.count({ where: { userId, name: { not: ARCHIVE_PROJECT_NAME } } }),
    prisma.diagram.count({ where: { userId } }),
    prisma.diagramTemplate.count({ where: { userId, templateType: "user" } }),
    prisma.prompt.count({ where: { userId } }),
  ]);
  return {
    scope: "user",
    selectable: "none",
    sections: [
      { label: "Projects", count: projects },
      { label: "Diagrams", count: diagrams },
      { label: "Templates", count: templates },
      { label: "Prompts", count: prompts },
    ],
  };
}

/** Per-member project/diagram counts within one org. */
async function membersWithCounts(orgId: string): Promise<PreviewUser[]> {
  const members = await prisma.orgMember.findMany({ where: { orgId }, select: { userId: true } });
  const ids = Array.from(new Set(members.map((m) => m.userId)));
  if (ids.length === 0) return [];
  const [users, projByUser, diagByUser] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } }),
    prisma.project.groupBy({ by: ["userId"], where: { orgId, userId: { in: ids } }, _count: { _all: true } }),
    prisma.diagram.groupBy({ by: ["userId"], where: { orgId, userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const pmap = new Map(projByUser.map((r) => [r.userId, r._count._all]));
  const dmap = new Map(diagByUser.map((r) => [r.userId, r._count._all]));
  return users
    .map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      projects: pmap.get(u.id) ?? 0,
      diagrams: dmap.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function previewOrgBackup(orgId: string): Promise<BackupPreview> {
  const users = await membersWithCounts(orgId);
  const [projects, diagrams] = await Promise.all([
    prisma.project.count({ where: { orgId } }),
    prisma.diagram.count({ where: { orgId } }),
  ]);
  return {
    scope: "org",
    selectable: "users",
    users,
    sections: [
      { label: "Members", count: users.length },
      { label: "Projects", count: projects },
      { label: "Diagrams", count: diagrams },
    ],
  };
}

export async function previewFullBackup(): Promise<BackupPreview> {
  const orgsRaw = await prisma.org.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const orgs: PreviewOrg[] = [];
  for (const o of orgsRaw) {
    orgs.push({ orgId: o.id, name: o.name, users: await membersWithCounts(o.id) });
  }
  // Per-table breakdown, derived from the SAME catalog the backup itself uses
  // (getBackupSchema) — so the summary lists every table that will be backed up
  // and a newly-added table appears automatically, with no edit here. Friendly
  // labels for the well-known headline tables; the raw model name for the rest.
  const schema = await getBackupSchema();
  const FRIENDLY: Record<string, string> = {
    Org: "Orgs", User: "Users", Project: "Projects", Diagram: "Diagrams",
    DiagramRules: "AI Rules", ScannerRule: "Scan Rules",
  };
  const HEADLINE = ["Org", "User", "Project", "Diagram", "DiagramRules", "ScannerRule"];
  const delegates = prisma as unknown as Record<string, { count?: () => Promise<number> }>;
  const counts = new Map<string, number>();
  await Promise.all(schema.insertOrder.map(async (table) => {
    const delegate = delegates[delegateName(table)];
    if (delegate?.count) counts.set(table, await delegate.count());
  }));
  // Headline tables first (in a fixed, friendly order), then every remaining
  // table in catalog (dependency) order — the full breakdown.
  const ordered = [
    ...HEADLINE.filter((t) => counts.has(t)),
    ...schema.insertOrder.filter((t) => !HEADLINE.includes(t) && counts.has(t)),
  ];
  const sections: BackupSection[] = ordered.map((t) => ({
    label: FRIENDLY[t] ?? t,
    count: counts.get(t) ?? 0,
  }));
  return {
    scope: "full",
    selectable: "orgs",
    orgs,
    sections,
  };
}
