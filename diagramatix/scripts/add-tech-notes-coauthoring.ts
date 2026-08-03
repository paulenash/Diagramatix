/**
 * Add a "Co-authoring & domain-managed orgs" chapter to the SuperAdmin
 * **Technical Design Notes** (`tech-design` collection, /tech-notes). Documents
 * the non-obvious engineering behind the 2026-08-03 batch. Idempotent: upserts
 * the chapter + each section by heading; appended after the last tech-design chapter.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-coauthoring.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-coauthoring.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "co-authoring";
const TITLE = "Co-authoring & domain-managed orgs";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Concurrency floor: the version guard",
    body: [
      "A diagram is one `Diagram.data` JSON blob saved by a debounced full-document `PUT`. Before this, the write was a blind `update where:{id}` — last writer silently clobbered the *entire* other document.",
      "",
      "**Fix:** `Diagram.version Int`. The data-changing `PUT` is now a compare-and-swap — `updateMany where:{ id, version }` with `version:{increment:1}`. A stale client (`count===0`) gets a **409** carrying the current `{ version, data, lastEditor }` instead of overwriting. Legacy clients (no version) + metadata-only saves keep the unconditional write.",
    ].join("\n"),
  },
  {
    heading: "Presence & soft locks (Phase 1, poll-based)",
    body: [
      "No server-push infra existed, so presence follows the notifications-bell pattern: a `DiagramPresence` row per (diagram,user), refreshed by an ~8s heartbeat `POST /api/diagrams/[id]/presence` that upserts the caller and returns the live roster (30s TTL) + a merged soft-lock map. **`DiagramPresence` is ephemeral** — excluded from scoped backups (`SCOPED_OMITTED`).",
      "",
      "The soft-lock signal is simply the other editor's **selection** (`editingElementIds`). The client blocks move/resize/label/delete on a locked element in `DiagramEditor` (advisory) and draws a dashed ring; the version guard is the hard backstop.",
    ].join("\n"),
  },
  {
    heading: "Conflict auto-merge (Phase 1d)",
    body: [
      "On 409, `mergeDiagram(base, ours, theirs)` does a three-way merge keyed by element/connector **id**, using the client's last-saved copy as the common ancestor. Non-overlapping edits merge silently; a true overlap (same id changed both sides, differently) resolves to **theirs** and is reported. Scalars are 3-wayed; viewport stays local.",
      "",
      "`useAutoSave` applies the merge automatically and resumes — a dismissible note appears only when there were real overlaps. `lastSaved` is reset to the *server's* data so the merged result (which still carries our edits) re-saves at the new version.",
    ].join("\n"),
  },
  {
    heading: "Live cursors (Phase 2, Liveblocks)",
    body: [
      "Real-time cursors follow the Deepgram token pattern: `POST /api/collab/token` mints a **room-scoped Liveblocks access token** from `requireDiagramAccess` (owner/edit → FULL_ACCESS, else READ_ACCESS); the browser connects to Liveblocks directly, the container stays stateless. `CollabCursors` broadcasts the pointer in **world coords** and renders others' cursors inside the Canvas world `<g>` (a `1/zoom` counter-scale keeps them screen-constant).",
      "",
      "**Activation is a single runtime env var:** the diagram server page detects `LIVEBLOCKS_SECRET_KEY` and passes `collabRealtime` — no `NEXT_PUBLIC` build flag, no rebuild. Unset → the editor runs Phase 1 (polled presence) unchanged. `LIVEBLOCKS_SECRET_KEY` lives in Key Vault in prod.",
    ].join("\n"),
  },
  {
    heading: "Domain-managed org membership",
    body: [
      "Root cause of stray personal orgs: `registerUser` / `ensureDefaultOrgForUser` always minted a `\"<name>'s Org\"` — there was no email-domain → org mapping.",
      "",
      "**Now:** `Org.emailDomains String[]` + `Org.domainJoinRole OrgRole?`. `joinDomainOrgOrCreatePersonal` (shared by registration + SSO) upserts a membership in the org claiming the email's domain (default role `ProcessOwner`), else creates a personal org. Since `POST /api/orgs` is SuperAdmin-only, a domain-managed user cannot create their own org. Domains are claimed from Org Settings (SuperAdmin). Consolidating existing users is a `plpgsql` DO block that re-points Project/Diagram, drops the personal org's auto-seeded `Prompt`/`DiagramRules` (Restrict FKs), and deletes the empty org.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const at = (last?.sortOrder ?? 0) + 1;
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created ${COLLECTION} chapter "${TITLE}" at sortOrder ${at}.`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" already exists — updating sections in place.`);
    }
    let i = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
