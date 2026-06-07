/**
 * Test data factories.
 *
 * Every factory takes a minimal `opts` partial and fills in unique-ish
 * defaults so tests don't have to bikeshed names. IDs come from the
 * real cuid generator on the Prisma side; emails / names get a small
 * counter so duplicate-key races don't bite.
 *
 * Higher-level helpers compose the primitives — `createUserWithOrg`
 * is the typical setup for "a regular user with their own personal
 * Org as Owner", which is how registrations work in prod.
 */

import { prisma } from "@/app/lib/db";
import type { OrgRole } from "@/app/lib/auth/orgRoleType";

let counter = 0;
function next() {
  counter += 1;
  return counter;
}

export async function createUser(opts?: {
  email?: string;
  name?: string | null;
}) {
  const n = next();
  return prisma.user.create({
    data: {
      email: opts?.email ?? `test-user-${n}@diagramatix.test`,
      name: opts?.name ?? `Test User ${n}`,
      password: "", // unused in direct-function tests; auth is bypassed
    },
  });
}

export async function createOrg(opts?: {
  name?: string;
  allowCrossOrgSharing?: boolean;
}) {
  const n = next();
  return prisma.org.create({
    data: {
      name: opts?.name ?? `Test Org ${n}`,
      allowCrossOrgSharing: opts?.allowCrossOrgSharing ?? false,
    },
  });
}

export async function addOrgMember(
  userId: string,
  orgId: string,
  role: OrgRole = "Viewer",
) {
  return prisma.orgMember.create({
    data: { userId, orgId, role },
  });
}

/**
 * The most common test setup — a user with their own personal Org and
 * an Owner-role membership in it. Matches the production registration
 * flow where every new user gets a default Org.
 */
export async function createUserWithOrg(opts?: { email?: string }) {
  const user = await createUser({ email: opts?.email });
  const org = await createOrg({ name: `${user.email}-org` });
  await addOrgMember(user.id, org.id, "Owner");
  return { user, org };
}

export async function createProject(opts: {
  userId: string;
  orgId: string;
  name?: string;
}) {
  const n = next();
  return prisma.project.create({
    data: {
      userId: opts.userId,
      orgId: opts.orgId,
      name: opts.name ?? `Test Project ${n}`,
    },
  });
}

export async function addProjectShare(
  projectId: string,
  userId: string,
  role: "VIEW" | "EDIT" = "VIEW",
) {
  return prisma.projectShare.create({
    data: { projectId, userId, role },
  });
}

export async function createDiagram(opts: {
  userId: string;
  orgId: string;
  projectId?: string | null;
  name?: string;
  diagramOwnerId?: string | null;
}) {
  const n = next();
  return prisma.diagram.create({
    data: {
      userId: opts.userId,
      orgId: opts.orgId,
      projectId: opts.projectId ?? null,
      name: opts.name ?? `Test Diagram ${n}`,
      diagramOwnerId: opts.diagramOwnerId ?? null,
    },
  });
}
