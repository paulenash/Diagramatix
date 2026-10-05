# One OrgAdmin role, and who may delete — plan

Written for: Paul (to review before anything is built). Nothing here is implemented. Date: 2026-10-05.

## 1. Decisions so far (Paul, 2026-10-05)

1. There is **one** Org administration role, called **OrgAdmin**. No separate Owner.
2. An OrgAdmin has the **OrgAdmin screen**, where they can do all the settings implied by its tiles.
3. **Only SuperAdmins can destructively restore, or delete, anything of an administrative kind.** Ordinary users still delete **their own** work (diagrams, projects, templates, comments) — confirmed: "administration only".
4. An OrgAdmin **can** restore from an Org backup **non-destructively** (additive: it only ever adds). The full wipe-and-restore stays SuperAdmin-only.
4a. **Simple rule, no overrides: OrgAdmins delete nothing** (Paul, 2026-10-05). There is no per-Org switch to grant delete powers; SuperAdmin alone can delete, purge or destructively restore, and keeps doing so everywhere. An OrgAdmin has no function for seeing, restoring or purging other members' archived diagrams.
5. **Deleted diagrams go to an archive** (Paul, 2026-10-05). A user's own delete is therefore not destructive: it moves the diagram to the system archive project (`app/lib/archive.ts`), from where its owner can list and restore it (`GET/POST /api/diagrams/deleted`). **Purging** the archive, and restoring other people's archived diagrams, is SuperAdmin only (`/api/admin/archive`, already). The same archive-first rule is the model for any other delete we keep for users.
6. Billing: none is tied to the Owner role. Stripe checkout and portal belong to the individual user. The schema comment "Owner … billing and deletion" is stale and gets corrected.

## 2. What the code does today (found by reading it)

- Roles: `OrgRole` = Owner, Admin, RiskOwner, ProcessOwner, ControlOwner, InternalAudit, BoardObserver, Viewer. **Every administrative check accepts `Owner` and `Admin` identically** (`role in ["Owner","Admin"]` — about 30 sites, plus `requireOrgAdminFor`, `requireRole`, the last-admin guard in `manageAdmins.ts`). Nothing gives Owner a power Admin lacks.
- Where Owner is *created*: registration (`app/api/orgs/route.ts:109`), domain auto-join (`app/lib/auth/domainOrg.ts:70`), the new SuperAdmin Org set-up (`superAdminOrg.ts`), and the backup restore of members.
- Org backup: `GET/POST /api/org-admin/backup` — OrgAdmin or SuperAdmin; restore is **additive only** (fresh ids, nothing overwritten, scoped to the caller's Org, no wipe mode). It also creates a missing user and adds them as a member (kept — otherwise their projects have no owner).
- Full backup / wipe restore: `/api/admin/full-backup` — SuperAdmin only already.

## 3. The delete audit — what an OrgAdmin can delete today

Read from the `DELETE` handlers and their guards:

| Area | Route(s) | Guard today | Under the new rule |
|---|---|---|---|
| Delete an Org, delete a user, archive, groups, impersonation, examples, partner API, voice/dev tools | `orgs/[id]`, `admin/users/[id]`, `admin/archive`, `admin/groups/[id]`, `admin/*` | **SuperAdmin only** already | unchanged |
| Org libraries: PCF frameworks and nodes, Entity lists / nodes / structures, Risk-control libraries / items / links, Simulation teams, Member teams | `orgs/[id]/pcf/**`, `orgs/[id]/entity-*/**`, `orgs/[id]/risk-controls/**`, `orgs/[id]/simulation-teams/**`, `orgs/[id]/member-teams` | `requireOrgAdminFor` (OrgAdmin) | **SuperAdmin only** for DELETE; OrgAdmin may still create / edit / rename |
| Delete a project that belongs to another member | `projects/[id]` | project owner, or OrgAdmin of the project's Org | owner or SuperAdmin; **not** OrgAdmin |
| Project shares removed by an OrgAdmin | `projects/[id]/shares/**` | project owner / OrgAdmin | owner may remove their own shares; OrgAdmin may not remove others' |
| Demote / remove an OrgAdmin | `orgs/[id]/admins/[userId]` | OrgAdmin (with a last-admin guard) | **decision needed (Q2)** |
| A user deleting their OWN diagram / project / template / prompt / comment | `diagrams/[id]`, `projects/[id]`, `templates/[id]`, `prompts/[id]` … | the owner | unchanged |
| A user's deleted diagrams (archive) | `diagrams/deleted` | the owner lists and restores their own | unchanged — a restore only adds back; **purging** stays SuperAdmin-only (`admin/archive`) |
| Does an OrgAdmin see or restore other members' archived diagrams? | `diagrams/deleted` (own only) | no | stays no; SuperAdmin only |
| Org backup restore | `org-admin/backup` POST | OrgAdmin | unchanged — additive only |

Mechanism: one helper, `requireSuperAdminToDelete(session)`, used by every OrgAdmin-reachable DELETE; plus a source-scan ratchet (like the mutating-route one) so a **new** DELETE route under `orgs/**` or `org-admin/**` that lets an OrgAdmin delete fails the build. The UI hides the delete buttons for OrgAdmins, and the server refuses regardless.

## 4. Merging Owner and Admin into OrgAdmin

- **Storage:** keep the existing enum value `Admin` as the one role and show it as **OrgAdmin** everywhere (`orgRoleLabels.ts`). Do **not** drop `Owner` from the Postgres enum (risky, no benefit); stop writing it. A one-off, idempotent SQL file (for the in-app Database tile, proven on `diagramatix_test` first) turns every existing `Owner` row into `Admin`.
- **Code:** replace each `role === "Owner" || role === "Admin"` / `in: ["Owner","Admin"]` with a single `isOrgAdminRole(role)` (about 30 sites). New Orgs, domain auto-join, `superAdminOrg.ts` and the restore create `Admin`. During the transition `isOrgAdminRole` still accepts a stray `Owner`, so nothing locks anyone out before the SQL runs.
- **Last-admin guard** (cannot remove the last OrgAdmin) stays.
- **Backups:** a backup written with `Owner` restores as `Admin`.
- **Docs:** User Guide / Tech Notes wording ("Owner") and the schema comment corrected (DB-held text → idempotent SQL patch).

## 5. Slices (each ships on its own, suite green before each push)

| # | Slice | Contents | Size |
|---|---|---|---|
| 1 | Role merge | `isOrgAdminRole`, label "OrgAdmin", stop creating Owner, tests (a source scan that no code compares to `"Owner"`), SQL file for existing rows | M |
| 2 | Delete lockdown | `requireSuperAdminToDelete` on the OrgAdmin-reachable DELETEs in section 3, UI buttons hidden, route ratchet, tests | M |
| 3 | OrgAdmin screen tidy | Every tile an OrgAdmin should have is on `/dashboard/org-admin`; the SuperAdmin-only ones are not shown to them | S |
| 4 | Docs + prod SQL | text patch for the User Guide / Tech Notes, TESTS_SUMMARY, memory | S |

Then the **AI Model Selection Changes** plan builds on this (its Q1 is answered: "OrgAdmin").

## 6. Decisions (all four questions answered, Paul, 2026-10-05 — every recommendation accepted)

1. **Every existing Owner becomes OrgAdmin** (one idempotent SQL file).
2. **An OrgAdmin may still demote or remove admins and members** — it destroys no data; the last-admin guard stays.
3. **Org library deletes:** no delete button for an OrgAdmin; a visible line "ask your SuperAdmin to remove this". Create, edit and rename stay.
4. **A user deleting their own shared project:** unchanged — owner-only, and it goes to the archive.

Status: planned, not built. Next step is slice 1 (the role merge).
