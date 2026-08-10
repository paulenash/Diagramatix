"use client";

import { useEffect, useState } from "react";

interface Org { id: string; name: string; emailDomains: string[]; subscriptionLevelId: string | null }
interface Level { id: string; name: string }

/**
 * SuperAdmin — assign whole Orgs to a subscription level (e.g. Enterprise). Every
 * member of the org (including users auto-joined by the org's claimed email
 * domains, e.g. getai.com.au) then resolves to at least that level. Saved per row.
 */
export function EnterpriseOrgsPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/orgs/subscription")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Load failed"))))
      .then((j) => { setOrgs(j.orgs); setLevels(j.levels); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function setLevel(orgId: string, levelId: string | null) {
    setSavingId(orgId); setMsg(null);
    setOrgs((os) => os.map((o) => (o.id === orgId ? { ...o, subscriptionLevelId: levelId } : o)));
    try {
      const r = await fetch("/api/admin/orgs/subscription", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, levelId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSavingId(null); }
  }

  const filtered = orgs.filter((o) =>
    !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.emailDomains.some((d) => d.toLowerCase().includes(q.toLowerCase())));
  const assigned = filtered.filter((o) => o.subscriptionLevelId);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Enterprise Organizations</h2>
          <p className="text-xs text-gray-500 mt-0.5">Assign an org to a subscription level — every member (and anyone in its claimed email domains) resolves to at least that level. {assigned.length} org(s) assigned.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orgs / domains…"
          className="text-xs border border-gray-300 rounded px-2 py-1.5 w-56" />
      </div>
      {msg && <p className="text-xs text-red-600 mb-1">{msg}</p>}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left font-medium text-gray-600 px-3 py-2">Organization</th>
              <th className="text-left font-medium text-gray-600 px-3 py-2">Claimed domains</th>
              <th className="text-left font-medium text-gray-600 px-3 py-2 w-40">Subscription</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-3 py-3 text-gray-500">Loading…</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-800">{o.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{o.emailDomains.length ? o.emailDomains.join(", ") : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-1.5">
                  <select value={o.subscriptionLevelId ?? ""} disabled={savingId === o.id}
                    onChange={(e) => setLevel(o.id, e.target.value || null)}
                    className={`text-[11px] border rounded px-1 py-0.5 ${o.subscriptionLevelId ? "border-green-300 bg-green-50 text-green-800" : "border-gray-300"}`}>
                    <option value="">— members' own tier —</option>
                    {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
