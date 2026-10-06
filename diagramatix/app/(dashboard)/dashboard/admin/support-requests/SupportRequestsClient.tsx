"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

export interface SupportRow {
  id: string; userEmail: string; userName: string | null; diagramId: string; diagramName: string; subject: string; message: string;
  status: string; via: string | null; error: string | null; attempts: number;
  createdAt: string; lastAttemptAt: string | null; sentAt: string | null;
}

const TONE: Record<string, string> = {
  sent: "text-green-700 bg-green-50 border-green-200",
  failed: "text-red-700 bg-red-50 border-red-200",
  received: "text-amber-700 bg-amber-50 border-amber-200",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU") : "—");

export function SupportRequestsClient({ initial, mail }: { initial: SupportRow[]; mail: { graph: boolean; smtp: boolean } }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const failed = rows.filter((r) => r.status !== "sent").length;
  const shown = onlyFailed ? rows.filter((r) => r.status !== "sent") : rows;

  async function resend(id: string) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch(`/api/admin/support-requests/${id}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Resend failed (${res.status})`);
      if (body.row) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...body.row } : r)));
      setMsg(body.ok ? "Sent." : "Still failing — see the error on the row.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Resend failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-red-600 hover:text-red-800">‹ SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Support Requests</h1>
        {failed > 0 && <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">{failed} not emailed</span>}
      </header>

      <div className="max-w-6xl mx-auto px-6 py-5">
        <p className="text-xs text-gray-500 mb-2">
          Every &ldquo;Send to support&rdquo; request is saved here <em>before</em> its email is attempted, so a mail outage never loses one.
          Mail goes by{" "}
          <strong>{mail.graph ? "Microsoft Graph" : "—"}</strong>
          {mail.graph && mail.smtp ? ", then SMTP if Graph fails" : mail.smtp && !mail.graph ? <><strong>SMTP</strong> (Graph is not configured — see app/lib/mail/graphMail.ts for the one-time Azure setup)</> : ""}
          {!mail.graph && !mail.smtp ? " — nothing is configured, so mail is only printed to the server log" : ""}.
        </p>
        <div className="flex items-center gap-3 mb-3 text-xs">
          <label className="flex items-center gap-1 text-gray-600"><input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} /> Not emailed only</label>
          {msg && <span className="text-gray-600" role="status">{msg}</span>}
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th scope="col" className="text-left font-medium px-3 py-2">Received</th>
                <th scope="col" className="text-left font-medium px-3 py-2">From</th>
                <th scope="col" className="text-left font-medium px-3 py-2">Subject</th>
                <th scope="col" className="text-left font-medium px-3 py-2">Status</th>
                <th scope="col" className="text-left font-medium px-3 py-2">Tries</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No support requests{onlyFailed ? " that failed" : " yet"}.</td></tr>}
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.userName ? `${r.userName} ` : ""}<span className="text-gray-500">{r.userEmail}</span></td>
                    <td className="px-3 py-2">
                      <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-left text-blue-700 hover:underline">{r.subject}</button>
                      <div className="text-gray-400">{r.diagramName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block border rounded px-1.5 py-0.5 ${TONE[r.status] ?? TONE.received}`}>{r.status}</span>
                      {r.via && <span className="ml-1 text-gray-500">via {r.via}</span>}
                    </td>
                    <td className="px-3 py-2">{r.attempts}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => resend(r.id)} disabled={busy === r.id}
                        className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {busy === r.id ? "Sending…" : r.status === "sent" ? "Send again" : "Resend"}
                      </button>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="whitespace-pre-wrap text-xs text-gray-800 font-sans">{r.message}</pre>
                        {r.error && <p className="mt-2 text-red-700 break-words"><strong>Last error:</strong> {r.error}</p>}
                        <p className="mt-2 text-gray-500">Last tried {when(r.lastAttemptAt)} · sent {when(r.sentAt)} · diagram id {r.diagramId}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
