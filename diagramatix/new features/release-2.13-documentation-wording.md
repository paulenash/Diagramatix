# Release 2.13 — wording for the User Guide, Features catalog and Technical Notes

These three live in the database and are edited in the running app (Steps 10–12 of "update everything"), after the deploy.
Paste and adjust. Nothing here is committed to the product; it is a working draft.

---

## 10a — User Guide ▸ Overview: the version line

Replace the version number with the live badge value once deployed — it reads **2.13.\<build\>** (read it off the header badge or `/api/schema`; the build is the git commit count and is only known after the deploy).

---

## 10b — User Guide pages

### A. Using Diagramatix on your phone (new page, or extend the existing Mobile page)

> **Mobile Access**
>
> Diagramatix has a phone app at the same address — open it on your phone and it takes you there automatically. Mobile Access is included on every paid plan (Introductory and above). It needs two other features to be on for your plan: **Process Review** and **Voice Assist**. If your plan does not include them you will see a page saying why, with a link to the plans and a button to use the desktop version instead.
>
> **What you can do on the phone**
> - **View and review** any BPMN diagram, and leave review comments.
> - **Create a diagram by speaking**, or by photographing a whiteboard or sketch. Say what the process is, or take the photo; Diagramatix draws it. You can correct it in words and generate again, and a **Free Form** option keeps the layout of your photo.
> - **Edit by voice.** Tap the 🎤 button on a diagram and say commands such as "add a task called Check invoice after Receive order", "rename Check invoice to Verify invoice", "delete Pay supplier" or "undo that". You can type a command instead if you prefer.
>
> **Selecting things**
> - Tap an element to select it. Tapping anywhere inside a task, event or gateway selects it; a boundary event always wins over the task it sits on.
> - Tap a connector's line, between its two ends, to select it — it is highlighted in blue. Then say "delete this" or "reverse this".
> - Turn on **Select several** and tap two elements in order; the first you tapped is 1, the second is 2. Then say "connect these" and the first flows into the second.
>
> **Numbers**
> When Diagramatix asks you to choose ("which task?", "rename tasks", "delete connectors"), it puts green numbers on the diagram and shows the same numbers as buttons under the diagram. Tap a number, or say it. For a delete you can say several at once — "three, seven, eight and nine" — or "all" (which asks you to confirm).
>
> **Auto-connect** (a checkbox under the diagram): when it is on, "add a task" joins the new task to the one you added last, or to the one you have selected.
>
> **Staying connected.** The screen stays awake while the microphone is listening. If your connection drops, listening reconnects by itself and nothing you said in the gap is lost. If another app takes the microphone (a phone call), listening stops and tells you why.

### B. Voice Assist — new connector commands (add to the existing Voice Assist page, desktop and phone)

> **Connectors and messages**
> - **"delete this"** — with a connector selected (click it, or tap it on the phone), removes that connector. It works for any kind: a sequence flow, a message, an association. "Delete the selected message" works even if something else is selected too.
> - **"reverse this"** — flips the direction of the selected connector. If the rules do not allow the reversed direction (for example a flow into a start event), it says so and changes nothing.
> - **"connect these"** — with exactly two elements selected, joins the **first** one you selected to the **second**. Select them in the order you want them joined. If that order is not allowed it says so.
> - **"delete connectors"** / **"delete messages"** — with a connector selected: that one. With elements selected: the connectors (or messages) attached to them. With nothing selected: numbers every one on the diagram and asks which; say the numbers, or "all" (which asks you to confirm).
>
> **Deleting several things by number.** With nothing selected, "delete tasks", "delete events", "delete gateways", "delete lanes" or "delete pools" number them all and ask which. Answer with numbers ("three, seven, eight and nine", "one through four", "twenty two"), a name, or "all". One undo takes the whole batch back.

### C. Your plan, your limits and what happens at them (new page for customers)

> **Your plan and its limits**
> Click **Subscription** at the top of the dashboard to see your plan, how much you have used and when a monthly allowance resets.
>
> **When you reach a limit** Diagramatix now tells you what happened and what to do, instead of quietly not doing it. A message shows how much you have used on your plan and, for a monthly allowance, **the date it resets**. A lifetime allowance says it does not reset. There is always a **See plans** button.
>
> **A feature that is not in your plan** says which plan includes it. If a feature needs another feature you do not have (for example Mobile Access needs Voice Assist), it names the one that is missing.
>
> **Warnings before something stops.** A strip at the top of the dashboard warns you about: a payment that did not go through (with an **Update payment** button), a subscription that is about to end, a trial that is ending or has ended, a complimentary upgrade that is about to finish, and any allowance you have used 80% or all of. **Dismiss** hides a warning for the day.
>
> **Allowances set for you.** If support has changed some of your allowances, the usage panel says so: "Some allowances on your account were set by support and differ from the standard plan."
>
> **Your trial.** Trial length is part of your plan. While it runs everything works; when it ends, creating, generating, exporting and importing pause until you upgrade — you can still open and edit what you have.

### D. SuperAdmin — Feature Availability, testing a plan, and customising one person (SuperAdmin guide)

> **Feature Availability** (SuperAdmin ▸ Feature Availability)
> One row per feature, one column per plan. Each cell is **Available**, **Disabled** (shown, not usable) or **Not Available** (hidden and refused by the server). A plan with no row for a feature counts as Available, so a new feature is never locked out by accident.
> - **Enforcement badge.** Each row says whether anything reads it: *enforced*, *partly*, *not enforced yet* or *info only*. The ⓘ button lists the screens and routes that enforce it, what else limits it (for example the AI attempts limit), and what it needs. Every feature is now enforced or informational; a new one cannot be added without a gate.
> - **Needs.** A feature that needs others (Mobile Access needs Process Review and Voice Assist; the Simulator and Process Mining sub-features need their module) is only as available as the weakest of them. A cell that says Available but is held back shows **in effect: Not Available**.
> - **Preview a plan** lists exactly what a plan gets, including unsaved edits. **Not fully enforced only** filters the list.
> - **Order of precedence** for what a person gets: a SuperAdmin gets everything (unless acting as a level) → an active comp grant → the higher of their own plan and their organisation's plan → that plan's cell → the person's own override → then what the feature needs.
> - The public **Pricing** and **Features** pages read these cells and each plan's limits live; nothing on them needs editing by hand when you change a cell or a limit.
>
> **Act as a level.** Double-click the Diagramatix logo to cycle the view: SuperAdmin → OrgAdmin → Enterprise → Expert → Professional → Introductory → Free. In a plan view the **server** treats you as a customer on that plan: features are hidden or refused, limits bite, usage is really counted, and an amber "Acting as …" pill shows. The bypass is off while you are acting.
>
> **Test tools** (Registered Users ▸ a user's usage panel, when they are not bypassing limits). Set a counter to an exact number, reset all counters, or set "trial days left" — so a limit can be reached in seconds. Setting the trial moves the trial's start date, which is also the anchor of the monthly allowance periods.
>
> **Customise one person** (Registered Users ▸ **Customise**). Change one person's limits, settings (the "reset monthly" switches, trial days) and feature availability **without changing their plan** — nobody else on that plan is affected.
> - Every row shows the **plan's** value, **this person's** override and what is **in effect**, with a **Revert** for the row. **Revert all to the plan** clears everything (limits, features, note, expiry — including any Text to Speech grant).
> - A **note** is required: it is the record of why. An optional **expiry** date reverts the overrides by itself.
> - An override that **raises** access stays until the person's plan gives at least that much (an upgrade covers it) — then it shows *(the plan now covers this)* and the plan's value is used. An override that **lowers** access always stays.
> - A person with any override shows a **custom** badge; each change is recorded in the audit log.
> - This is **in addition to** Grant comp / Revoke comp (the free upgrade), which is unchanged: a comp puts someone on another whole plan for a while; a customisation changes individual values on whatever plan applies. Overrides are kept on top of a comp.

---

## 11 — Features catalog (draft → publish to the public /features page)

Keep these to claims the product makes today. (The "every feature, by plan" table on /features is generated from the plans and needs no wording here.)

**Mobile Access** — *Summary:* Your diagrams on your phone: view, review, and edit by voice.
- Open any BPMN diagram on your phone and review it, leaving comments
- Create a diagram by speaking, or by photographing a whiteboard
- Edit by voice: add, rename, connect and delete by saying it
- Tap to select; numbered choices you can tap or say
- Screen stays awake while listening; reconnects if the signal drops
- Included on every paid plan

**Plans that show their working** — *Summary:* Every limit and every feature is spelled out for each plan, and stays true.
- Each plan's limits — projects, diagram size, AI generations, exports and imports — read straight from the plan
- An "every feature, by plan" comparison built from what each plan actually includes
- Clear messages when you reach a limit: how much, when it resets, and how to raise it
- Warnings before a trial, subscription or allowance runs out

**Voice Assist: connectors** — *Summary:* Delete, reverse and join connectors by voice.
- "Delete this", "reverse this", "connect these" on the selection
- Delete several connectors, messages or elements by number in one go
- One undo takes the whole batch back

*(Publish only the three above; the rest of the release is internal.)*

---

## 12 — Technical Design Notes (SuperAdmin Document Editor, /tech-notes)

**Title: Feature availability, limits and per-user overrides (2.13)**

**1. One source of truth for "what does this person get".**
- `features/effectiveLevel.ts` resolves a user's effective plan once: an active comp grant, else the higher (by `sortOrder`) of the user's own plan — after the cancelled-subscription grace downgrade to Free — and any plan assigned to an organisation they belong to. It is a leaf module (imports only the database), used by the feature matrix, the numeric limits (`checkLimit`, `getUsageSnapshot`), the editor's element cap and the speech gate.
- `features/availability.ts` `getFeatureStates(userId)` = the plan's matrix row per feature (a missing row fails open to Available; an unreadable state is Not Available) → the person's own overrides (`userOverrides.ts`) → **dependencies** (`dependencies.ts`, `FeatureDef.requires`): a feature is only as available as the weakest prerequisite (available > disabled > hidden). A SuperAdmin gets everything unless acting as a level.
- **Gate map.** `features/gateMap.ts` lists, per feature, the screens and routes that enforce it. `tests/features/gate-map.test.ts` checks it against the source: every feature has an entry, every listed gate still exists, a feature marked not-enforced is read by no gate, and **no gate names a key that is not in the registry** (a typo would lock a feature out for everyone but a SuperAdmin). The not-enforced list is empty and is a ratchet.

**2. Act as a level.** The `dgx_sa_mode` cookie (set by the logo double-click) names a plan. `features/actAs.ts` `currentActAsLevel()` reads it inside a request; it is only honoured for a user whose email is in `SUPERUSER_EMAILS` (the cookie is client-writable, so it can never affect anyone else). While acting, `getFeatureStates`, `loadUserWithTier`/`checkLimit`/`recordUsage`/`getUsageSnapshot`, `elementCountLimitFor` and `speechGranted` evaluate as that plan with the SuperAdmin bypass off, and the person's own overrides are ignored. Usage is really counted, so a limit can be reached and tested.

**3. Per-user overrides** (`features/userOverrides.ts`, `User.limitOverrides` / `featureOverrides` / `overrideNote` / `overridesExpireAt`).
- Storage: `limitOverrides { <SubscriptionLevel field>: { v, base } }` (`v` the override, `null` = unlimited; `base` = what the plan gave when it was set); `featureOverrides { key: { s, base } | "available"|"disabled"|"hidden" }` (the bare string is the older form and always applies). `limitOverrides` is `Json` with a `{}` default and is written through raw `pgPool` SQL (Prisma 7 omits JSON from update inputs).
- The rule: a **grant** (`v > base`) applies only while the current plan gives less — once the plan gives at least as much it is *covered* and the plan's value is used; a **restriction** (`v ≤ base`) always applies; switches (`…ResetMonthly`) always apply; everything stops at `overridesExpireAt` (lazy revert, like a comp). Unlimited compares as the largest value.
- Applied where the effective plan row is built (`loadUserWithTier`) so every limit consumer sees it with no other change; overrides sit on top of whichever plan applies (own, organisation or comp).
- API `GET/PUT/DELETE /api/admin/users/[id]/overrides` — SuperAdmin only, `blockReadOnlyImpersonation`, audited (`user.overrides.update` / `.revert`); a note is required when anything is customised; `inherit` reverts one key, `DELETE` reverts all.

**4. Notices.** `subscription/messages.ts` builds every limit / feature / trial / policy message (how much, which plan, when a monthly allowance resets, the plan that has the feature, the prerequisite missing). `gateFeature` / `gateLimit` keep the old 403 fields (`error`, `metric`, `current`, `limit`, `feature`) and add `message` and a structured `notice`. Browser: `showGateNotice(res)` / `downloadWithNotice(url, name)` raise a `GateNoticeHost` dialog instead of a silent return or a page of JSON. `subscription/warnings.ts` (pure) decides the dashboard strip's warnings.

**5. Public pages.** `features/publicMatrix.ts` builds "every feature, by plan" from the matrix (prerequisites applied; features off on every plan and informational entries omitted — an audit certificate must not read as a plan tick); `subscription/publicCopy.ts` generates each plan's limit lines from the `SubscriptionLevel` row (`null` = unlimited). The trial length comes from the Free plan's `trialDays`; `GET /api/plans` serves names, prices and the trial to the sign-up form. (It is not under `app/api/public/**`, which is reserved for the partner API and guarded by a test.)

**6. Enforcement changes worth knowing.**
- Wiring the 22 previously-unread features did **not** take access away: the seed and `patch-wire-features-keep-todays-access.sql` set them Available at every level; the spreadsheet's intent is preserved in `menus_and_features/feature-availability.xlsx-intent.json` and applied only by `apply-xlsx-restrictions.sql`.
- Simulator and Process Mining: the module keys stay; ten sub-features each `require` their module. Every simulation route that changes or computes something is gated (`tests/simulation/route-gating.test.ts`, the counterpart of the mining test); the three simulation AI narrations count against the AI attempts limit and fall back to the deterministic summary at it.
- Limits: `isOverLimit` — element counts are over only when they *exceed* the limit (the editor always allowed exactly N; the server used to reject it); every other metric blocks *at* the limit. Every project-creating path counts against the project cap. `POST /api/me/subscription` no longer restamps the trial clock.
- Not counted, by decision: Voice Assist AI is not counted against the AI attempts limit.
- Mobile Access is the `mobile` feature, `requires: ["process-review", "voice-assist"]`; the `/m` layout resolves it server-side and shows `MobileUnavailable` when it is not in the plan.
