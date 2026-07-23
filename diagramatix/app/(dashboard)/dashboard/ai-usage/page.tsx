import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { ratesByModel, costFrom } from "@/app/lib/ai/aiRates";
import {
  AI_INVOCATION_POINT_VALUES,
  labelForInvocationPoint,
} from "@/app/lib/ai/aiTelemetry";
import { AiUsageClient } from "./AiUsageClient";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * AI Usage report. SuperAdmin sees every org (incl. per-org + per-user
 * breakdowns) and can edit the cost-rate catalog; an OrgAdmin (Owner/Admin of
 * the active org) sees ORG-AGGREGATE ONLY — never singled-out individual users.
 * Cost is shown next to every token figure via the editable rate catalog.
 */

interface Agg {
  invocations: number;
  success: number;
  failure: number;
  inTokens: number;
  outTokens: number;
  retries: number;
  cost: number;
}
const blank = (): Agg => ({ invocations: 0, success: 0, failure: 0, inTokens: 0, outTokens: 0, retries: 0, cost: 0 });

const RANGE_DAYS: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "365": 365, all: null };

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const su = await isActingSuperuser(session);
  const cookieStore = await cookies();
  const activeOrgId = await getCurrentOrgId(session, cookieStore);
  let activeOrgName: string | null = null;
  if (!su) {
    const m = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: activeOrgId },
      select: { role: true, org: { select: { name: true } } },
    });
    if (!(m?.role === "Owner" || m?.role === "Admin")) redirect("/dashboard");
    activeOrgName = m?.org.name ?? null;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const rangeKey = one(sp.range) in RANGE_DAYS ? one(sp.range) : "30";
  const days = RANGE_DAYS[rangeKey];
  const since = days === null ? undefined : new Date(Date.now() - days * 86_400_000);
  const fProvider = one(sp.provider);
  const fModel = one(sp.model);
  const fPoint = one(sp.point);
  // Org / user filters are SuperAdmin-only (OrgAdmin is locked to its own org and
  // never sees per-user data).
  const fOrg = su ? one(sp.org) : "";
  const fUser = su ? one(sp.user) : "";

  const where: Prisma.AiInvocationWhereInput = {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(su ? {} : { orgId: activeOrgId }),
    ...(fProvider ? { provider: fProvider } : {}),
    ...(fModel ? { model: fModel } : {}),
    ...(fPoint ? { invocationPoint: fPoint } : {}),
    ...(fOrg ? { orgId: fOrg } : {}),
    ...(fUser ? { userId: fUser } : {}),
  };

  // ── Aggregation ─────────────────────────────────────────────────────────────
  const rates = await ratesByModel();
  const costOf = (model: string, inTok: number, outTok: number) => costFrom(rates.get(model), inTok, outTok);

  // One categorical groupBy gives us model / provider / point / status rollups.
  const grouped = await prisma.aiInvocation.groupBy({
    by: ["invocationPoint", "model", "provider", "status"],
    where,
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, retries: true },
  });

  const total = blank();
  const byModel = new Map<string, Agg & { provider: string }>();
  const byPoint = new Map<string, Agg>();
  const byProvider = new Map<string, Agg>();

  for (const g of grouped) {
    const n = g._count._all;
    const inTok = g._sum.inputTokens ?? 0;
    const outTok = g._sum.outputTokens ?? 0;
    const retries = g._sum.retries ?? 0;
    const cost = costOf(g.model, inTok, outTok);
    const success = g.status === "success";
    const bump = (a: Agg) => {
      a.invocations += n;
      if (success) a.success += n; else a.failure += n;
      a.inTokens += inTok;
      a.outTokens += outTok;
      a.retries += retries;
      a.cost += cost;
    };
    bump(total);
    if (!byModel.has(g.model)) byModel.set(g.model, { ...blank(), provider: g.provider });
    bump(byModel.get(g.model)!);
    if (!byPoint.has(g.invocationPoint)) byPoint.set(g.invocationPoint, blank());
    bump(byPoint.get(g.invocationPoint)!);
    if (!byProvider.has(g.provider)) byProvider.set(g.provider, blank());
    bump(byProvider.get(g.provider)!);
  }

  // Time series — bucket by UTC day in JS (low volume; capped for safety).
  const rows = await prisma.aiInvocation.findMany({
    where,
    select: { createdAt: true, status: true, inputTokens: true, outputTokens: true, model: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const seriesMap = new Map<string, { day: string; success: number; failure: number; inTokens: number; outTokens: number; cost: number }>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    if (!seriesMap.has(day)) seriesMap.set(day, { day, success: 0, failure: 0, inTokens: 0, outTokens: 0, cost: 0 });
    const b = seriesMap.get(day)!;
    if (r.status === "success") b.success += 1; else b.failure += 1;
    b.inTokens += r.inputTokens;
    b.outTokens += r.outputTokens;
    b.cost += costOf(r.model, r.inputTokens, r.outputTokens);
  }
  const series = [...seriesMap.values()];
  const seriesCapped = rows.length >= 5000;

  // SuperAdmin-only: per-org + per-user (top consumers).
  let byOrg: Array<{ id: string; name: string } & Agg> = [];
  let byUser: Array<{ id: string; name: string } & Agg> = [];
  if (su) {
    const [orgGroups, userGroups] = await Promise.all([
      prisma.aiInvocation.groupBy({ by: ["orgId", "model", "status"], where, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, retries: true } }),
      prisma.aiInvocation.groupBy({ by: ["userId", "model", "status"], where, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, retries: true } }),
    ]);
    // model is in the grouping so we can cost each org/user (cost shows wherever
    // tokens do).
    const rollup = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      groups: any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyOf: (g: any) => string | null,
    ) => {
      const m = new Map<string, Agg>();
      for (const g of groups) {
        const key = keyOf(g) ?? "—";
        if (!m.has(key)) m.set(key, blank());
        const a = m.get(key)!;
        const n = g._count._all as number;
        const inTok = (g._sum.inputTokens ?? 0) as number;
        const outTok = (g._sum.outputTokens ?? 0) as number;
        a.invocations += n;
        if (g.status === "success") a.success += n; else a.failure += n;
        a.inTokens += inTok;
        a.outTokens += outTok;
        a.retries += (g._sum.retries ?? 0) as number;
        a.cost += costOf(g.model as string, inTok, outTok);
      }
      return m;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgMap = rollup(orgGroups as any, (g: any) => g.orgId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMap = rollup(userGroups as any, (g: any) => g.userId);

    const orgIds = [...orgMap.keys()].filter((k) => k !== "—");
    const userIds = [...userMap.keys()].filter((k) => k !== "—");
    const [orgs, users] = await Promise.all([
      prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const userName = new Map(users.map((u) => [u.id, u.name || u.email]));
    byOrg = [...orgMap.entries()].map(([id, a]) => ({ id, name: id === "—" ? "(no org)" : orgName.get(id) ?? id, ...a }));
    byUser = [...userMap.entries()].map(([id, a]) => ({ id, name: id === "—" ? "(system)" : userName.get(id) ?? id, ...a }));
    byOrg.sort((a, b) => b.invocations - a.invocations);
    byUser.sort((a, b) => b.invocations - a.invocations);
  }

  // Filter option lists (scope-wide, not narrowed by the current filters, so a
  // filter can always be widened again). Points = the full static list.
  const orgOptions = su
    ? (await prisma.aiInvocation.findMany({ where: since ? { createdAt: { gte: since } } : {}, select: { orgId: true }, distinct: ["orgId"] }))
        .map((r) => r.orgId)
        .filter((x): x is string => !!x)
    : [];
  const orgOptionNames = su && orgOptions.length
    ? new Map((await prisma.org.findMany({ where: { id: { in: orgOptions } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]))
    : new Map<string, string>();

  const toArr = (m: Map<string, Agg>) => [...m.entries()].map(([k, a]) => ({ key: k, ...a }));
  const modelArr = [...byModel.entries()].map(([k, a]) => ({ key: k, ...a })).sort((x, y) => y.cost - x.cost || y.invocations - x.invocations);
  const pointArr = toArr(byPoint)
    .map((p) => ({ ...p, label: labelForInvocationPoint(p.key) }))
    .sort((x, y) => y.invocations - x.invocations);
  const providerArr = toArr(byProvider).sort((x, y) => y.invocations - x.invocations);

  return (
    <AiUsageClient
      isSuperAdmin={su}
      activeOrgName={activeOrgName}
      filters={{ range: rangeKey, provider: fProvider, model: fModel, point: fPoint, org: fOrg, user: fUser }}
      filterOptions={{
        providers: ["anthropic", "moonshot"],
        models: [...new Set([...rates.keys(), ...modelArr.map((m) => m.key)])].sort(),
        points: AI_INVOCATION_POINT_VALUES.map((p) => ({ value: p, label: labelForInvocationPoint(p) })),
        orgs: su ? orgOptions.map((id) => ({ id, name: orgOptionNames.get(id) ?? id })) : [],
      }}
      summary={total}
      byModel={modelArr}
      byPoint={pointArr}
      byProvider={providerArr}
      series={series}
      seriesCapped={seriesCapped}
      byOrg={byOrg}
      byUser={byUser}
      rates={su ? [...rates.values()] : []}
    />
  );
}
