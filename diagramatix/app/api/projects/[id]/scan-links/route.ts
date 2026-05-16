import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import {
  getCurrentOrgId,
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

interface ElementLite {
  id: string;
  type: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}

interface DiagramShape {
  id: string;
  name: string;
  type: string;
  data: {
    elements?: ElementLite[];
    connectors?: unknown[];
    /** Legacy single-parent field — superseded by parentDiagramIds. The
     *  scan sweep deletes it whenever it finds the field set. */
    parentDiagramId?: string;
    parentDiagramIds?: string[];
  } | null;
}

interface ExistingLink {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  childDiagramId: string;
  childDiagramName: string;
}

interface Candidate {
  parentDiagramId: string;
  parentDiagramName: string;
  parentElementId: string;
  parentElementLabel: string;
  candidateDiagramId: string;
  candidateDiagramName: string;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Extract a leading "process code" from a name: 1–3 letters, 1–3 digits,
 *  a `.` separator, then 1–3 digits — e.g. "P1.2", "AR12.3", "ABC123.456".
 *  Anchored to the start and followed by a word boundary so codes embedded
 *  later in the name (or longer numeric runs that just happen to share a
 *  prefix) don't match. Returned uppercase for case-insensitive compare. */
const CODE_RE = /^([A-Za-z]{1,3}\d{1,3}\.\d{1,3})\b/;
function extractCode(name: string): string | null {
  const m = name.trim().match(CODE_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Drop the leading process code (if present) and any whitespace/punctuation
 *  separating it from the descriptive remainder. Used to compare just the
 *  textual part of two names, ignoring whatever codes they carry — e.g.
 *  "P1.2 Collections Process" → "collections process". Returns "" when the
 *  name is only a code or empty after stripping. */
function stripCodeTail(name: string): string {
  const trimmed = name.trim();
  const m = trimmed.match(CODE_RE);
  const tail = (m ? trimmed.slice(m[0].length) : trimmed)
    .replace(/^[\s\-:_.]+/, "");
  return normalize(tail);
}

/** Levenshtein distance, classic O(n*m) DP. Capped check via early exit
 *  when far over the threshold isn't needed for typical short names. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** GET — return existingLinks + definiteCandidates + probableCandidates. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id, orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Pull all BPMN diagrams in the project. type === "bpmn" is the only
  // value used in production for BPMN; the scan is scoped accordingly.
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId: id, orgId, type: "bpmn" },
    select: { id: true, name: true, type: true, data: true },
    orderBy: { name: "asc" },
  })) as unknown as DiagramShape[];

  // Index: normalized diagram name → list of diagrams with that name.
  // (Same-name diagrams in one project are rare but theoretically possible.)
  const byNormName = new Map<string, DiagramShape[]>();
  for (const d of diagrams) {
    const k = normalize(d.name);
    if (!k) continue;
    const list = byNormName.get(k) ?? [];
    list.push(d);
    byNormName.set(k, list);
  }
  const diagramById = new Map(diagrams.map((d) => [d.id, d] as const));
  // Precomputed code + post-code tail per diagram name — used by the two
  // probable-match rules: same code, or same descriptive text after the code.
  const codeByDiagramId = new Map(diagrams.map((d) => [d.id, extractCode(d.name)] as const));
  const tailByDiagramId = new Map(diagrams.map((d) => [d.id, stripCodeTail(d.name)] as const));

  const existingLinks: ExistingLink[] = [];
  const definiteCandidates: Candidate[] = [];
  const probableCandidates: Candidate[] = [];

  for (const d of diagrams) {
    const elements = d.data?.elements ?? [];
    for (const e of elements) {
      if (e.type !== "subprocess" && e.type !== "subprocess-expanded") continue;
      // Return-link variants live on child diagrams and aren't candidates
      // themselves — skip them when scanning for parent-side subprocesses.
      if (e.properties?.isReturnLink) continue;

      const label = (e.label ?? "").trim();
      const linkedId = (e.properties?.linkedDiagramId as string | undefined) ?? "";

      if (linkedId) {
        const child = diagramById.get(linkedId);
        if (child) {
          existingLinks.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            childDiagramId: child.id,
            childDiagramName: child.name,
          });
        }
        continue; // already linked — never a candidate
      }

      if (!label) continue;
      const normLabel = normalize(label);
      const labelCode = extractCode(label);
      const labelTail = stripCodeTail(label);

      // Exact (normalized) match against any diagram name → definite.
      const exact = byNormName.get(normLabel);
      if (exact && exact.length > 0) {
        for (const c of exact) {
          if (c.id === d.id) continue; // never self-link
          definiteCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
          });
        }
        continue;
      }

      // Probable: Levenshtein ≤ 3 (relative to the shorter name), OR
      // either name contains the other after normalization, OR the two
      // names share the same leading process code (e.g. both start "P1.2"),
      // OR the descriptive text after the code matches in both names.
      for (const c of diagrams) {
        if (c.id === d.id) continue;
        const normCand = normalize(c.name);
        if (!normCand) continue;
        if (normCand === normLabel) continue; // already handled above
        const contains =
          normLabel.length >= 4 && normCand.length >= 4 &&
          (normLabel.includes(normCand) || normCand.includes(normLabel));
        const dist = levenshtein(normLabel, normCand);
        const dynThreshold = Math.min(3, Math.max(1, Math.floor(Math.min(normLabel.length, normCand.length) / 4)));
        const candCode = codeByDiagramId.get(c.id) ?? null;
        const codesMatch = !!labelCode && labelCode === candCode;
        const candTail = tailByDiagramId.get(c.id) ?? "";
        const tailsMatch = !!labelTail && labelTail === candTail;
        if (contains || dist <= dynThreshold || codesMatch || tailsMatch) {
          probableCandidates.push({
            parentDiagramId: d.id,
            parentDiagramName: d.name,
            parentElementId: e.id,
            parentElementLabel: label,
            candidateDiagramId: c.id,
            candidateDiagramName: c.name,
          });
        }
      }
    }
  }

  return NextResponse.json({
    existingLinks,
    definiteCandidates,
    probableCandidates,
    diagramCount: diagrams.length,
  });
}

interface AddOp { parentDiagramId: string; parentElementId: string; candidateDiagramId: string }
interface RemoveOp { parentDiagramId: string; parentElementId: string }
interface ApplyBody { adds?: AddOp[]; removes?: RemoveOp[] }

/** POST — apply user-confirmed adds + removes.
 *
 *  add: sets parent.element.properties.linkedDiagramId = candidateDiagramId,
 *       and creates a return-link element on the child near its first
 *       start event (if no return-link to that parent already exists).
 *  remove: clears linkedDiagramId on the parent element, and deletes the
 *          matching return-link on the child diagram IF no other parent
 *          still links to that child. */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id, orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as ApplyBody;
  const adds = Array.isArray(body.adds) ? body.adds : [];
  const removes = Array.isArray(body.removes) ? body.removes : [];

  // Pull every BPMN diagram in the project once; we mutate the in-memory
  // shape and write each modified diagram back via raw pg (Prisma 7 JSON
  // writes go through pgPool per project convention).
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId, orgId, type: "bpmn" },
    select: { id: true, name: true, data: true },
  })) as unknown as Array<{
    id: string;
    name: string;
    data: {
      elements?: ElementLite[];
      connectors?: unknown[];
      parentDiagramId?: string;
      parentDiagramIds?: string[];
    } | null;
  }>;

  const diagramById = new Map(diagrams.map((d) => [d.id, d] as const));
  const touched = new Set<string>(); // diagram ids whose data we modified

  // Apply REMOVES first so the new state is consistent for add-after-remove.
  for (const op of removes) {
    const parent = diagramById.get(op.parentDiagramId);
    if (!parent || !parent.data) continue;
    const elements = parent.data.elements ?? [];
    const target = elements.find((e) => e.id === op.parentElementId);
    if (!target || !target.properties) continue;
    const previousChildId = (target.properties.linkedDiagramId as string | undefined) ?? "";
    if (!previousChildId) continue;
    delete target.properties.linkedDiagramId;
    touched.add(parent.id);

    // (Stale return-link symbols and parentDiagramIds are reconciled by
    // the project-wide sweep at the end of this handler.)
  }

  // Apply ADDS — only the parent-side `linkedDiagramId` is set here.
  // Back-link metadata on the child (parentDiagramIds list) is recomputed
  // from scratch during the project-wide normalize pass below, so we don't
  // duplicate that logic per-add.
  for (const op of adds) {
    const parent = diagramById.get(op.parentDiagramId);
    const child = diagramById.get(op.candidateDiagramId);
    if (!parent || !child || !parent.data) continue;
    if (parent.id === child.id) continue;
    const elements = parent.data.elements ?? [];
    const target = elements.find((e) => e.id === op.parentElementId);
    if (!target) continue;
    target.properties = target.properties ?? {};
    target.properties.linkedDiagramId = child.id;
    touched.add(parent.id);
  }

  // Project-wide normalize pass — runs after every scan POST regardless of
  // whether the user added or removed anything. Does three things:
  //
  //   (a) Drops every on-canvas return-link symbol. Older versions of
  //       this feature created pill-shaped subprocesses with
  //       isReturnLink=true on child diagrams; they are no longer wanted.
  //   (b) Drops the legacy `parentDiagramId` (singular) field. It is
  //       superseded by `parentDiagramIds`.
  //   (c) Recomputes `parentDiagramIds` for every diagram from the
  //       canonical source of truth (other diagrams' subprocess
  //       linkedDiagramId fields). This catches manual edits, race
  //       conditions, and any drift accumulated by older code paths.
  for (const d of diagrams) {
    if (!d.data) continue;

    // (a) Strip return-link symbols.
    const els = d.data.elements ?? [];
    const cleaned = els.filter(
      (e) => !(e.type === "subprocess" && e.properties?.isReturnLink === true),
    );
    if (cleaned.length !== els.length) {
      d.data.elements = cleaned;
      touched.add(d.id);
    }

    // (b) Drop legacy singular field if present.
    if (d.data.parentDiagramId !== undefined) {
      delete d.data.parentDiagramId;
      touched.add(d.id);
    }

    // (c) Recompute parentDiagramIds. A "parent" is any other diagram
    //     containing a non-return-link subprocess/subprocess-expanded
    //     whose linkedDiagramId equals d.id.
    const parents: string[] = [];
    for (const other of diagrams) {
      if (other.id === d.id) continue;
      const otherEls = other.data?.elements ?? [];
      const links = otherEls.some(
        (e) =>
          (e.type === "subprocess" || e.type === "subprocess-expanded") &&
          !e.properties?.isReturnLink &&
          (e.properties?.linkedDiagramId as string | undefined) === d.id,
      );
      if (links) parents.push(other.id);
    }
    // Stable order by diagram name for the UI.
    const nameById = new Map(diagrams.map((x) => [x.id, x.name] as const));
    parents.sort((a, b) => (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? ""));
    const existing = d.data.parentDiagramIds ?? [];
    const same = existing.length === parents.length && existing.every((v, i) => v === parents[i]);
    if (!same) {
      if (parents.length === 0) delete d.data.parentDiagramIds;
      else d.data.parentDiagramIds = parents;
      touched.add(d.id);
    }
  }

  // Persist every modified diagram via raw pg (Prisma 7 JSON write rule).
  if (touched.size > 0) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      for (const did of touched) {
        const d = diagramById.get(did);
        if (!d) continue;
        await client.query(
          'UPDATE "Diagram" SET "data" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
          [JSON.stringify(d.data ?? {}), did],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return NextResponse.json({
    added: adds.length,
    removed: removes.length,
    diagramsTouched: touched.size,
  });
}
