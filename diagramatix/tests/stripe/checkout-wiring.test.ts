/**
 * Stripe checkout + portal wiring (GAP 6). Three deterministic pieces extracted
 * from the checkout / portal routes so they can be unit-tested without hitting
 * Stripe over the network:
 *
 *   1. originFromRequest — the X-Forwarded-* origin logic both routes inlined.
 *   2. PAID_TIER_IDS / isPaidTierId — the paid-tier allow-list the checkout
 *      route 400s against.
 *   3. getOrCreateStripeCustomer — the DATA-31 customer-dedup, exercised against
 *      the REAL test DB with an INJECTED fake Stripe client (no network, no
 *      mocks of Prisma). The fake records its calls so we can assert when
 *      list/create are (not) hit.
 *
 * The routes are unchanged behaviourally — they now call originFromRequest /
 * PAID_TIER_IDS from app/lib/stripe, and getOrCreateStripeCustomer's injected
 * client defaults to the module singleton, so default-arg callers are identical.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import {
  originFromRequest,
  PAID_TIER_IDS,
  isPaidTierId,
  getOrCreateStripeCustomer,
} from "@/app/lib/stripe";

// ── 1. originFromRequest ──────────────────────────────────────────────
describe("originFromRequest", () => {
  const make = (url: string, headers: Record<string, string>) =>
    new Request(url, { headers });

  it("forwarded host + proto → proto://host", () => {
    const req = make("http://0.0.0.0:3000/api/stripe/checkout", {
      "x-forwarded-host": "app.diagramatix.com",
      "x-forwarded-proto": "https",
    });
    expect(originFromRequest(req)).toBe("https://app.diagramatix.com");
  });

  it("forwarded host, no proto → defaults to https://host", () => {
    const req = make("http://0.0.0.0:3000/api/stripe/checkout", {
      "x-forwarded-host": "app.diagramatix.com",
    });
    expect(originFromRequest(req)).toBe("https://app.diagramatix.com");
  });

  it("a non-https forwarded proto is honoured", () => {
    const req = make("http://0.0.0.0:3000/api/stripe/checkout", {
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    expect(originFromRequest(req)).toBe("http://localhost:3000");
  });

  it("no forwarded headers → new URL(req.url).origin", () => {
    const req = make("https://diagramatix.example/api/stripe/portal?x=1", {});
    expect(originFromRequest(req)).toBe("https://diagramatix.example");
  });
});

// ── 2. Paid-tier validation ───────────────────────────────────────────
describe("paid-tier validation (PAID_TIER_IDS / isPaidTierId)", () => {
  it("each paid tier id is accepted", () => {
    for (const id of ["introductory", "professional", "expert"]) {
      expect(PAID_TIER_IDS.has(id), id).toBe(true);
      expect(isPaidTierId(id), id).toBe(true);
    }
  });

  it("free / unknown / empty / missing are rejected", () => {
    for (const id of ["free", "bogus", ""]) {
      expect(PAID_TIER_IDS.has(id), id).toBe(false);
      expect(isPaidTierId(id), id).toBe(false);
    }
    expect(isPaidTierId(undefined)).toBe(false);
    expect(isPaidTierId(null)).toBe(false);
  });
});

// ── 3. getOrCreateStripeCustomer (DATA-31 dedup), real DB + fake client ─

/** A fake Stripe customers client that records every list/create call. The
 *  shape matches what the SUT reads: list → { data: [{ id, deleted, metadata }] },
 *  create → { id }. */
function fakeStripe(opts: {
  listResult?: Array<{ id: string; deleted?: boolean; metadata?: Record<string, string> }>;
  newId?: string;
}) {
  const calls = { list: [] as unknown[], create: [] as unknown[] };
  return {
    calls,
    customers: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list: async (params: any) => {
        calls.list.push(params);
        return { data: opts.listResult ?? [] };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (params: any) => {
        calls.create.push(params);
        return { id: opts.newId ?? "cus_new" };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("getOrCreateStripeCustomer — DATA-31 dedup (real DB, injected client)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("user already has a stripeCustomerId → returns it, Stripe never queried", async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: "cus_existing" },
    });
    const fake = fakeStripe({ newId: "cus_should_not_create" });

    const id = await getOrCreateStripeCustomer(
      { id: user.id, email: user.email, name: user.name, stripeCustomerId: "cus_existing" },
      fake,
    );

    expect(id).toBe("cus_existing");
    expect(fake.calls.list).toEqual([]);
    expect(fake.calls.create).toEqual([]);
  });

  it("null id + a tagged customer in the list → REUSES it, create NOT called", async () => {
    const user = await createUser();
    const fake = fakeStripe({
      listResult: [
        { id: "cus_other", deleted: false, metadata: { diagramatixUserId: "someone-else" } },
        { id: "cus_match", deleted: false, metadata: { diagramatixUserId: user.id } },
      ],
      newId: "cus_should_not_create",
    });

    const id = await getOrCreateStripeCustomer(
      { id: user.id, email: user.email, name: user.name, stripeCustomerId: null },
      fake,
    );

    expect(id).toBe("cus_match");
    expect(fake.calls.list.length).toBe(1);
    expect(fake.calls.create).toEqual([]); // reuse path must not create

    // ACTUAL behaviour: the reused id IS persisted to the DB (the function
    // always runs the prisma.user.update persist step, regardless of whether
    // the id came from a reuse-match or a fresh create).
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.stripeCustomerId).toBe("cus_match");
  });

  it("null id + empty list → CREATES a new customer, persists it to the DB", async () => {
    const user = await createUser();
    const fake = fakeStripe({ listResult: [], newId: "cus_brand_new" });

    const id = await getOrCreateStripeCustomer(
      { id: user.id, email: user.email, name: user.name, stripeCustomerId: null },
      fake,
    );

    expect(id).toBe("cus_brand_new");
    expect(fake.calls.list.length).toBe(1);
    expect(fake.calls.create.length).toBe(1);
    // create is tagged with our user id (so the next reuse lookup works).
    expect(fake.calls.create[0]).toMatchObject({
      email: user.email,
      metadata: { diagramatixUserId: user.id },
    });

    // Persisted to User.stripeCustomerId — verify the real DB row.
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.stripeCustomerId).toBe("cus_brand_new");
  });

  it("a soft-deleted customer with our tag is NOT reused (deleted:true skipped)", async () => {
    const user = await createUser();
    const fake = fakeStripe({
      listResult: [{ id: "cus_dead", deleted: true, metadata: { diagramatixUserId: user.id } }],
      newId: "cus_fresh",
    });

    const id = await getOrCreateStripeCustomer(
      { id: user.id, email: user.email, name: user.name, stripeCustomerId: null },
      fake,
    );

    expect(id).toBe("cus_fresh");
    expect(fake.calls.create.length).toBe(1);
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.stripeCustomerId).toBe("cus_fresh");
  });
});
