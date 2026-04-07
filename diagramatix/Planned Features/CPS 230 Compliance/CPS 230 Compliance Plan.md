# Plan: Diagramatix CPS 230 Compliance Support

> **Final destination:** Once plan mode is exited, this file should be copied to
> `diagramatix/Planned Features/CPS 230 Compliance/CPS 230 Compliance Plan.md`.
> Plan mode constrains edits to the plan file at the standard path.

## Context

APRA Prudential Standard CPS 230 *Operational Risk Management* came into force
**1 July 2025**. It applies to all APRA-regulated entities (ADIs, insurers,
super funds) and requires them to manage operational risk, maintain critical
operations through disruption within tolerance levels, and manage service
provider risk. Source document: `diagramatix/new features/Prudential Standard
CPS 230 Operational Risk Management - clean.pdf`.

Diagramatix's BPMN process modelling capability is a natural starting point for
the *critical operations and dependencies* pillar, but on its own it is far
from sufficient. CPS 230 requires register-style artefacts (critical operations,
risks, controls, incidents, BCPs, scenario tests), tolerance level management,
incident notification timers, and Board approval evidence — none of which exist
in Diagramatix today.

The user-confirmed scope for this plan is:
1. **Critical operations & dependencies** (paras 27, 34–39)
2. **Operational risk + controls** (paras 24–31)
3. **BCP, scenario testing, incidents** (paras 32–46)
4. **Multi-tenancy** added in this plan (orgs, roles, audit) — required because
   CPS 230 is enterprise compliance with Board accountability and role separation
5. **Material service providers** (paras 47–60) are **out of scope** for this
   plan but the data model must not preclude adding them later

## Key design decisions (and what was rejected)

- **Registers come before BPMN extensions.** The compliance artefacts APRA cares
  about live in tables, not diagrams. Phase 1 ships every register with no
  canvas changes — a regulated entity can be substantially compliant from
  Phase 1 alone. BPMN linkage in Phase 2 earns the product's right-to-win
  vs spreadsheets.
- **No new "Critical Operations Map" diagram type for MVP.** Building a full
  editor (palette, symbols, routing, export) for a tree-of-resources is weeks
  of work for a feature users will populate via forms. Replaced by a server-
  rendered read-only SVG built from `CriticalOperationResource` rows using
  existing `SymbolRenderer` primitives. Reconsider only on real demand.
- **Multi-tenancy lands in the same release train, kept minimal.** Org +
  OrgMember + Role + `orgId` on every new table + a one-shot migration. Org
  invitation, SCIM, SSO-to-org mapping deferred.
- **No denormalised risk/control arrays on BPMN elements.** Use a separate
  `ElementLink` join table. Element IDs are not real foreign keys, so on each
  diagram save we reconcile and mark broken links — never cascade-delete a
  register row from a diagram edit.
- **Focused `RegisterChange` history table, not a generic AuditLog.** CPS 230
  needs evidence of register state and BCP approvals, not app-wide change
  logging.
- **`jspdf` and `svg2pdf.js` are already in `package.json`** — reuse existing
  export pipeline patterns, no new dependencies.
- **24h/72h notification clocks are visibility-only.** Diagramatix flags the
  deadline and records the notification *was* made (timestamp + evidence URL).
  We do NOT integrate with APRA Connect — out of scope and a regulatory
  minefield.
- **Marketing language must say "CPS 230 support" not "CPS 230 compliance".**
  The accountable persons remain the customer's. Worth a legal review before
  any marketing copy.

## Phase 0 — Multi-tenancy foundation (2–3 weeks)

Goal: get orgs in *before* writing register code so every new table is org-scoped
from day one. No backfill pain later.

**Prisma additions** (`diagramatix/prisma/schema.prisma`):
```
Org           { id, name, entityType (ADI|Insurer|LifeInsurer|HealthInsurer|RSE|Other), createdAt }
OrgMember     { id, orgId, userId, role, createdAt }
  role enum: Owner | Admin | RiskOwner | ProcessOwner | ControlOwner | InternalAudit | BoardObserver | Viewer
Project.orgId  -- nullable initially, NOT NULL after backfill
Diagram.orgId  -- denormalised for query speed; backfilled from project
```

**Migration script:** for each existing User → create one Org `${user.name}'s
Org`, create OrgMember(role=Owner), set `orgId` on all their Projects/Diagrams.

**New helper:** `app/lib/auth/orgContext.ts` exporting `getCurrentOrgId(session,
cookies)` (mirrors the existing impersonation pattern in `auth.ts`) and
`requireRole(session, orgId, allowedRoles)`.

**Existing API routes** under `app/api/diagrams`, `app/api/projects` get
`where: { orgId }` filters added next to `userId` in the same PR as the
migration so there is no window where data is unscoped.

**UI:** org switcher in the dashboard header (only matters once a user is in
>1 org).

**Verification:**
- Existing diagram CRUD still works for the migrated user.
- New user signup creates their default org.
- Reading another org's diagram returns 404.

## Phase 1 — Register MVP (4–6 weeks) — *the compliance phase*

Goal: deliver every CPS 230 register/artefact with no canvas changes. This
phase alone gets a regulated entity substantially compliant.

**New Prisma models** (all `orgId`-scoped, all writes recorded in
`RegisterChange`):

```
CriticalOperation {
  id, orgId, name, classification (mandatoryCategory enum + custom freetext),
  justification, ownerUserId, mtpdMinutes, maxDataLossMinutes,
  minServiceLevelText, status, createdAt, updatedAt
}
CriticalOperationResource {
  id, criticalOperationId, kind (people|technology|information|facility|serviceProvider|interdependency),
  name, description, ownerUserId?
}
  -- serviceProvider kept as a kind so the model isn't crippled when SP scope is added later

Risk {
  id, orgId, name, category (legal|regulatory|compliance|conduct|technology|data|changeManagement|other),
  description, inherentLikelihood, inherentImpact, residualLikelihood, residualImpact,
  ownerUserId, status (open|mitigated|accepted|closed), isControlGap,
  createdAt, updatedAt
}

Control {
  id, orgId, name, description,
  type (preventive|detective|corrective), frequency,
  designEffectiveness (notAssessed|ineffective|partial|effective),
  operatingEffectiveness (same enum),
  lastTestedAt, nextTestDueAt, ownerUserId, createdAt, updatedAt
}
RiskControl              { riskId, controlId }                  -- M:N
RiskCriticalOperation    { riskId, criticalOperationId }        -- M:N

Incident {
  id, orgId, title, description, severity, occurredAt, detectedAt, resolvedAt?,
  materialityAssessment, isMaterial,
  apraNotificationDueAt?, apraNotifiedAt?, apraNotificationEvidenceUrl?,
  status, createdAt, updatedAt
}
IncidentCriticalOperation { incidentId, criticalOperationId }
IncidentRisk              { incidentId, riskId }

ToleranceBreach {
  id, orgId, criticalOperationId, incidentId?,
  breachStartedAt, breachResolvedAt?,
  apraNotificationDueAt, apraNotifiedAt?, status
}

BCP {
  id, orgId, name, version, status (draft|approved|retired),
  boardApprovedAt?, boardApprovedByUserId?, boardMeetingReference?,
  lastReviewedAt?, nextReviewDueAt,
  content (JSON: triggers, actions, dependencies, communicationsStrategy),
  createdAt, updatedAt
}
BCPCriticalOperation { bcpId, criticalOperationId }

ScenarioTest {
  id, orgId, bcpId?, name, scenarioDescription,
  scheduledAt, executedAt?, results, gapsIdentified, remediationStatus,
  createdAt, updatedAt
}

RegisterChange {
  id, orgId, entityType, entityId, userId,
  action (create|update|delete|approve), diff (JSON),
  occurredAt
}
```

**API routes** (under `app/api/cps230/...`):
- `critical-operations`, `risks`, `controls`, `incidents`, `bcps`,
  `scenario-tests`, `tolerance-breaches`
- Each: REST CRUD + `GET /:id/history` reading `RegisterChange`
- All routes call `requireRole` and filter by `getCurrentOrgId`

**UI** (under `app/(dashboard)/cps230/...`):
- Tabular pages for each register — sortable, filterable, no fancy canvas
- Detail page per entity with edit form, change history, related-entity links
- Incident creation flow that calculates the 72h deadline (and 24h for tolerance
  breaches) and shows countdown badges
- BCP "mark Board approved" action: captures approver user, date, meeting ref;
  locks the version (treat like a signature)

**Verification:**
- A user can create a critical operation, attach resources, set MTPD.
- A user can record a risk, link controls and critical ops, see it in the register.
- A user can log an incident, mark it material, get a 72h countdown, record
  APRA notification with timestamp + URL.
- A user can create a BCP version, mark it Board-approved, see "next review
  due" 12 months out.
- All edits land in `RegisterChange` and appear on a History tab.
- A user with `Viewer` role cannot mutate.

## Phase 2 — Diagram linkage (3–4 weeks) — *the differentiation phase*

Goal: connect the registers to existing BPMN content. This is what makes
Diagramatix worth more than a spreadsheet.

**New Prisma model:**
```
ElementLink {
  id, orgId, diagramId, elementId,
  entityType (criticalOperation|risk|control), entityId,
  status (active|broken), createdAt
}
```

**Element `properties` extensions** on BPMN elements (free-form, derived/cached
only — `ElementLink` is authoritative):
- `cps230.processOwnerUserId?: string`
- `cps230.rtoMinutes?: number`
- `cps230.rpoMinutes?: number`
- `cps230.linkSummary?: { criticalOps, risks, controls }` — populated server-side
  on diagram load. Never authoritative.

**`PropertiesPanel.tsx`:** new collapsible "CPS 230" section with:
- Picker: link this element to existing critical operation(s) / risk(s) /
  control(s) — *picks from the register, never invents data inline*
- "Create new risk from here" / "Create new control from here" buttons that
  open a register modal pre-filled with element context, return and link
- Process owner picker (org members)
- RTO / RPO inputs

**`SymbolRenderer.tsx` / `Canvas.tsx`:** optional toggleable overlay layer
that draws badges (criticality halo, control count, risk count) using the
cached `linkSummary`. Pure read-only — same toggle pattern as the existing
`showValueDisplay` flag.

**Diagram save handler:** extract current element IDs, reconcile `ElementLink`
rows, mark orphans as `status: 'broken'` (don't delete — user might rename or
restore the element).

**New view:** Coverage Report — for each critical operation, list every diagram
element linked to it, grouped by diagram. Highlight critical ops with zero
linked elements. Highlight broken links with a "fix or remove" prompt.

**Verification:**
- Linking a BPMN task to a critical operation creates a row, shows on both sides.
- Deleting the BPMN task marks the link broken on next save; the critical op
  detail page shows the broken link with a "fix or remove" prompt.
- The coverage report flags critical ops with no linked process content.

## Phase 3 — Reporting & Board Pack (2–3 weeks)

- **CPS 230 dashboard page** (`app/(dashboard)/cps230/page.tsx`): tiles for
  open material incidents, breaches inside notification window, overdue
  control tests, BCPs past review date, scenario tests due, control gaps
  (`Risk.isControlGap=true`).
- **Board pack PDF** (`app/api/cps230/board-pack/route.ts`): server route using
  existing `jspdf` (see `app/lib/diagram/exportVisio.ts` for the structural
  pattern). Multi-section document — current critical ops register snapshot,
  open risks above threshold, control test summary, incidents in period,
  BCP status, scenario test results. Takes `periodStart`/`periodEnd` and a
  `snapshotAt` for point-in-time reproducibility (read `RegisterChange` to
  reconstruct historical state).
- **Coverage Report PDF** — same pipeline.
- **Critical Operation lifecycle visualisation** — server-rendered SVG built
  with existing `SymbolRenderer` primitives showing the operation as a central
  node and its resources as satellites. **This replaces the rejected new
  diagram type.** No editor, no palette, no Visio export. Pure read-only
  generated artwork. ~3 days work.

**Verification:** Board pack PDF generates, contains every section, is
reproducible for a past `snapshotAt` (history-aware).

## Phase 4 — Hardening & deferred items

Only if user demand justifies them:
- Org invitation flow + multi-org switcher polish
- Workflow approvals (e.g. Risk needs Risk Owner approval before draft → live)
- Webhook/email notifications for due dates
- Internal Audit role read-only export bundle
- A real "Critical Operations Map" diagram type — only if customers ask for
  spatial authoring
- File evidence storage abstraction (likely SharePoint via existing
  `app/lib/sharepoint.ts`)
- Service-provider register (when scope changes)

## Verification (end-to-end)

1. Run `npx prisma migrate dev` against PGlite — Phase 0 migration creates
   default orgs for the existing users; existing diagrams still render.
2. Sign in, navigate to `/cps230/critical-operations`, create one for each
   mandatory category for the org's `entityType`. Set MTPDs.
3. Create a Risk linked to one critical op, attach a Control, set
   `nextTestDueAt` in the past — confirm it appears as "overdue" on the
   dashboard.
4. Log an Incident, mark material — confirm 72h countdown appears.
5. Create a BCP, mark Board approved — confirm version locks and `nextReviewDueAt`
   = +12 months.
6. Open a BPMN diagram, link a task to the critical op — confirm
   `linkSummary` badge appears in the canvas overlay.
7. Delete the linked task — confirm `ElementLink.status` becomes `broken`,
   visible on the critical op detail page.
8. Generate the Board Pack PDF for the current period — confirm all sections
   render and a `snapshotAt` query returns historical state.
9. Sign in as a `Viewer` role user — confirm all mutate endpoints return 403
   and the UI hides edit controls.

## Critical files to read / modify

- `diagramatix/new features/Prudential Standard CPS 230 Operational Risk Management - clean.pdf` — the source spec
- `diagramatix/prisma/schema.prisma` — all new models
- `diagramatix/app/lib/diagram/types.ts` — `cps230.*` properties
- `diagramatix/auth.ts`, `diagramatix/auth.config.ts` — org context, role checks
- `diagramatix/app/api/diagrams/route.ts` — template for adding `orgId` scoping
- `diagramatix/app/api/projects/route.ts` — same template
- `diagramatix/app/components/canvas/PropertiesPanel.tsx` — Phase 2 CPS 230 section
- `diagramatix/app/components/canvas/SymbolRenderer.tsx` — overlay badges
- `diagramatix/app/components/canvas/Canvas.tsx` — overlay toggle
- `diagramatix/app/lib/diagram/exportVisio.ts` — structural template for the
  board-pack PDF generator
- `diagramatix/package.json` — `jspdf` and `svg2pdf.js` already present

## Risks to flag before committing

- **Regulatory representation risk.** Use "CPS 230 support" in marketing, not
  "CPS 230 compliance". Legal review of any customer-facing copy.
- **9 months post-deadline.** Ship Phases 0+1 hard and fast; do not let
  Phases 2–3 block release of Phase 1 — Phase 1 alone is the regulatory value.
- **Element-ID-as-foreign-key fragility.** Reconciliation must be in Phase 2
  from day one, not bolted on later.
- **Board approval is a legal artefact.** Lock BCP versions on approval;
  capture approver, date, meeting reference like a signature.
- **Scenario test evidence.** Customers will want to attach test plans /
  reports. MVP uses a URL field. Long-term needs file storage — most likely
  via existing `app/lib/sharepoint.ts`.
- **Internal audit (para 46).** A read-only "InternalAudit" role across the
  whole org is a hard requirement — included in Phase 0 role enum.
