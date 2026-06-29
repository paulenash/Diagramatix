# How to use the test suite

Diagramatix has **two test layers** that work together. Run everything from `diagramatix/`.

| Layer | Tool | What it covers | Command |
|---|---|---|---|
| **Unit / integration** | Vitest | Logic, data, authorization, exports, layout, the simulator — against the real test DB, no mocks | `npm test` |
| **End-to-end (browser)** | Playwright | The assembled app in a real Chromium — login, create→edit→persist, canvas drag | `npm run e2e` |

---

## 1. Running the unit suite (the workhorse, ~600 tests)

```bash
cd diagramatix
npm test                       # run everything once (CI does this)
npm run test:watch             # re-run on file changes while developing
npx vitest run tests/stripe    # just one folder
npx vitest run tests/stripe/webhook.test.ts        # just one file
npx vitest run -t "demote the LAST OrgAdmin"        # just tests matching a name
```

- **Needs PostgreSQL** with a `diagramatix_test` database (the same local Postgres you already run; the suite applies the schema itself on start).
- Green = all good. A **red** test means a change broke documented behaviour — read the failing assertion; the test name maps to a `Tnnnn` row in **`tests/TESTS_SUMMARY.md`** which explains what it protects and how it broke.
- Update a snapshot intentionally: `npx vitest run -u`.

## 2. Running the e2e suite (real browser)

```bash
cd diagramatix
npm run e2e          # headless — builds the app, serves it on :3001 vs diagramatix_test, drives Chromium
npm run e2e:headed   # same, but WATCH the browser do it
npm run e2e:ui       # interactive runner — step through, time-travel, pick tests
```

- First run installs the browser once: `npx playwright install chromium`.
- It builds + starts the app automatically (≈1–2 min) — you don't start anything yourself. If you already have a server on :3001 it's reused.
- On failure it saves a **trace + screenshots**; open the report with `npx playwright show-report`.

## 3. Reading what's tested

- **`tests/TESTS_SUMMARY.md`** — the hand-maintained catalog: every test as a `Tnnnn` row with "Protects you against" / "How it would break". Read this to understand coverage in plain terms.
- **`tests/TESTS.md`** — a browsable file→test inventory, regenerated with `npm run test:list`.

## 4. What runs in CI (GitHub Actions, every push + PR)

- **`.github/workflows/ci.yml`** → two jobs: **`test`** (unit suite + production build) and **`e2e`** (Playwright). A red job shows a ✗ on the commit. The e2e job uploads its HTML report as an artifact.
- **`.github/workflows/azure-deploy.yml`** → builds the Docker image + deploys. Separate; it does **not** run tests. (So each push shows *two* workflow runs — one tests, one deploys.)

## 5. Adding tests

**Unit (preferred for logic):** test the real function against the test DB — no mocks. If the logic lives in a route, extract it into a lib (see `app/lib/projects/deleteProject.ts`) and test the lib. Construct a session like `tests/sharing/access-guards.test.ts`; seed with `tests/_setup/factories.ts`. Then add a row to `TESTS_SUMMARY.md` with the **next `Tnnnn`** after the highest (append-only — never renumber).

**E2e (for real-browser journeys):** add a `*.spec.ts` under `e2e/`. Create diagrams via the API helper (`e2e/_helpers.ts → createBpmnDiagram`) and assert on the **persisted data** (`diagramData`) rather than the SVG DOM — it's far more robust. Editor specs run authenticated (a saved session); `auth-smoke.spec.ts` opts out to test login itself.

## 6. Which layer for what?

- Reach for **Vitest** first — it's milliseconds-fast and covers logic/data/authorization/exports/layout/simulation.
- Reach for **Playwright** only when the thing can *only* break in a real browser: a user journey, navigation, or **SVG canvas pointer interactions** (drag from the palette, etc.) — jsdom can't do layout or pointer, so those live here.
