# 03 — Access Control, Tenant Isolation & Audit Surface

*Who can reach a customer's data, whether one tenant is walled off from another, whether privileged access is accountable, and how data is deleted. These are the controls an enterprise's IAM and audit teams examine hardest.*

## 1. Authentication

- **Sessions:** JWT strategy (`auth.config.ts:7`), **no `maxAge` set → NextAuth default 30 days**, rolling, with **no idle timeout and no absolute cap**. Enterprises typically require ≤ 8–12 h with idle timeout.
- **Passwords:** bcrypt cost 12 (`registerUser.ts:47`); login verification is **timing-safe** against a fixed dummy hash to avoid user-enumeration; login **rate-limited** (10/15 min per email, 50/15 min per IP). *Good.* Inconsistency: registration requires ≥ 8 chars, but the password-change path in `/api/account` requires only 6 (`account/route.ts:93`).
- **SSO:** **Microsoft Entra ID only**, single hard-coded tenant (`AZURE_TENANT_ID`). **No SAML, no generic OIDC, no Okta/Google Workspace, no MFA/TOTP.** An enterprise that mandates its own IdP or SAML cannot be onboarded without code changes.
- **Self-registration is open:** `POST /api/register` lets anyone create an account (email + password ≥ 8) and auto-provisions a personal Org with `role: "Owner"`. **No email verification, no domain allowlist.** Anyone can self-provision a tenant.
- **Hardening present:** on Entra sign-in any pre-existing local password is wiped so only SSO can then authenticate that account (account pre-hijack defence, `auth.ts:99-110`); Microsoft tokens are held in the encrypted JWT and never exposed to the client.

## 2. Authorization & roles

**SuperAdmin is a hard-coded email allowlist** — the single most important thing an auditor needs to know (`app/lib/superuser.ts:2-6`):

```ts
export const SUPERUSER_EMAILS = new Set([
  "paul@nashcc.com.au", "paul@diagramatix.com.au", "greg.nash@getai.com.au",
]);
export function isSuperuser(session) {
  const email = session?.user?.email;
  return !!email && SUPERUSER_EMAILS.has(email.toLowerCase());
}
```

SuperAdmin is **not a stored, revocable role** — it is three literal addresses compiled into the app. Consequences: no MFA on those accounts, no rotation, no break-glass logging; anyone who compromises one of those mailboxes (or can set their account email to one — see the `/api/account` gap below) gains full-system administration, including full-DB export *with credentials* and TRUNCATE-restore.

**Two role systems** exist. The org-level `OrgRole` enum is rich (`Owner, Admin, RiskOwner, ProcessOwner, ControlOwner, InternalAudit, BoardObserver, Viewer`) but **write-gating almost everywhere collapses to `Owner`/`Admin`** — the specialised governance roles are largely not enforced as distinct capabilities at the API layer. Project-level access is `VIEW`/`EDIT` via `getProjectAccess`/`getDiagramAccess`.

**The authZ spine is otherwise solid and consistent:** `app/lib/auth/orgContext.ts` provides `getCurrentOrgId`, `requireRole`, `requireOrgAdminFor`, `requireProjectAccess`, `requireDiagramAccess`, and the risk-controls routes use `guardOrg`/`guardProject` wrappers. Public-by-design routes (`register`, forgot/reset-password, `features`, `schema`, the signature-verified Stripe webhook, and the `CRON_SECRET`-guarded cron/ingest routes) were individually verified as intentional.

**One authZ defect:** `PUT /api/account` lets *any authenticated user* change their active org's `name`/`entityType` **with no role check** (`account/route.ts:106-112`), directly contradicting the SuperAdmin-only gate on the parallel `PUT /api/orgs/[id]/settings`.

## 3. Privileged impersonation — the headline audit finding

`POST /api/admin/impersonate` sets two cookies — `dgx_view_as` (target userId) and `dgx_view_as_mode` (`view`|`edit`) — and `getEffectiveUserId()` then makes **every data query run as the target user**. Characteristics an auditor will flag:

- **`edit` mode fully mutates the target's data** — a SuperAdmin can read *and change* any tenant's process content (which may include regulated/PII data).
- **Cookies are `httpOnly: false`** ("client JS reads for the orange banner") and `sameSite: lax` — readable/writable by any client-side script, so an XSS in an admin session could set an impersonation target.
- **Silent elevation:** SuperAdmins (and Org Owners/Admins) are treated as **owner of every project/diagram in scope**; "no ProjectShare row is ever written for them and they never appear in any share list" (`orgContext.ts:301-311`). Access is invisible.
- **Zero audit trail.** The impersonate route writes nothing — no DB record, no notification, no log. **Starting/stopping impersonation and every action taken while impersonating leaves no attributable trace.** Combined with `edit` mode, this is the single largest data-governance gap.

OrgAdmins can also impersonate, restricted to members of their own active org.

## 4. Tenant isolation

- **Org is the tenant boundary.** Every `Project` and `Diagram` carries `orgId` (`Project.org` is `onDelete: Restrict`).
- **Scoping is query-level, not obscurity.** Lists filter `{ userId, orgId }` or an explicit share row; reads resolve owner → admin-elevation → ProjectShare → bundle grant, else 403. Ids are cuids and **no-access returns 403 (not 404)** to avoid leaking existence. *Good.*
- **Cross-org sharing is off by default** (`Org.allowCrossOrgSharing = false`). When an **OrgAdmin flips it on**, project owners can share to **any registered user in any org** — the sanctioned path for data to cross a tenant boundary, and one an enterprise will want to be able to *prohibit*, not just default-off.
- **Weak points:** the `/api/account` org-rename gap (§2), and the fact that org membership/role is the only thing between silent elevation and another tenant's data.

## 5. Audit trail — there isn't one

A schema-wide search found **no `AuditLog`/`ActivityLog`/`EventLog` model.** Consequences:

- **No record of** who viewed, edited, exported, shared, deleted, backed up, or impersonated.
- `Notification` is a user-facing inbox, not an admin audit log. `SchemaValidationIssue` is Zod observability only. `createdBy` breadcrumbs on shares/memberships record creation but nothing else. Backups embed only an `exportedBy` email *inside the file*, not in a queryable log.
- **Retention:** none defined for notifications, usage counters, or logs; no log shipping configured in-repo.
- **Process content in server logs:** the SMTP-unconfigured fallback `console.log`s full support-request content (`email.ts:111-118`); Visio export logs element/connector counts + **first 300 chars of page XML** (`exportVisio.ts:384-389`, `export/visio-v2/route.ts:62`); validation logs route + diagramId + path.

This is the biggest *systemic* gap: without an audit log, none of the privileged-access findings can be detected, investigated, or evidenced to an auditor.

## 6. Data lifecycle & erasure

- **Project delete is three-tier** (`deleteProject.ts`): `unorganise` (soft; Owner/SuperAdmin/OrgAdmin), `archive` (OrgAdmin), `hard` (permanent purge; **SuperAdmin who owns the project only**).
- **User deletion:** `DELETE /api/admin/users/[id]` — **SuperAdmin only**, requires `confirmEmail`, blocks self-delete and deleting another superuser; relies on Prisma cascades. **Orphan orgs are intentionally left behind** if the deleted user was the sole member; published artifacts survive with null author.
- **No GDPR self-erasure:** `/api/account` has GET and PUT only — **no DELETE**. A data subject cannot erase themselves; erasure needs a SuperAdmin and still leaves orphan org rows and null-author published versions.
- **Backups:** OrgAdmin backup is **scoped to the caller's org** (an OrgAdmin cannot export another org). Full-backup is **SuperAdmin-only** and returns **every row in every table including credentials**, with a `wipe`/TRUNCATE restore guarded only by `confirmPhrase === "WIPE"` — total-export and total-destruction capability tied to the three hard-coded emails, unlogged.

## 7. What's already reusable to lock things down

Three patterns exist; the third is the cleanest for per-tenant controls:

1. **Per-tier entitlements** — boolean columns on `SubscriptionLevel` (`hasSimulator/hasProcessMining/hasRiskControl/hasApqc`), enforced by the route wrapper **`gateFeature(userId, feature)`**. Per-user/tier, not per-org.
2. **`AppSetting`** key-value — **global**, good for system-wide toggles (used for AI model, Feature Colours, PCF colours); not org-scoped.
3. **`Org`-level boolean columns** — the precedent is **`Org.allowCrossOrgSharing`**, edited through the gated `PUT /api/orgs/[id]/settings` and enforced where policy is applied.

**The cleanest way to add "disable AI / disable external export / require SSO" per org** is to mirror `allowCrossOrgSharing`: add boolean policy columns on `Org`, expose them via the existing gated org-settings route + UI, and enforce them at route entry with a small `gateOrgPolicy(orgId, key)` helper analogous to `gateFeature`. This reuses proven authZ and gives real, FK-backed per-tenant isolation. See [05-gating-and-remediation-plan.md](05-gating-and-remediation-plan.md).
