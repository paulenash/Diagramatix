"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ──────────────────────────────────────────────────────────────────────
// API response shapes (kept local — keeps this dialog self-contained).
// ──────────────────────────────────────────────────────────────────────
interface OwnedDiagram {
  id: string;
  name: string;
  type: string;
  lifecycle: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  currentVersion: { versionNumber: number; publishedAt: string } | null;
}
interface AudienceCandidate {
  id: string;
  name: string | null;
  email: string;
}
interface PreviewMember {
  diagramId: string;
  name: string;
  type: string;
  lifecycle: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isRoot: boolean;
  pathCount: number;
  currentVersion: { versionNumber: number; publishedAt: string } | null;
  readyToBundle: boolean;
}
interface PreviewCrossLink {
  fromDiagramId: string;
  fromElementId: string;
  targetDiagramId: string;
  targetProjectId: string | null;
  targetName: string;
}
interface PreviewPayload {
  projectId: string;
  members: PreviewMember[];
  crossProjectLinks: PreviewCrossLink[];
  summary: {
    totalMembers: number;
    readyCount: number;
    draftCount: number;
    crossProjectLinkCount: number;
  };
}

interface Props {
  diagramId: string;            // the diagram the editor is on; pre-checked as initial root
  diagramName: string;
  projectId: string;
  onClose: () => void;
  onPublished: (bundleId: string) => void;
}

// ──────────────────────────────────────────────────────────────────────
// PublishBundleDialog — "Publish to business users…"
//
// Three-step composition in a single modal:
//   1. Pick roots — multi-select over diagrams in this project that the
//      caller owns. The diagram the editor is on is pre-checked.
//   2. Closure preview — auto-refreshes whenever the root set changes;
//      surfaces version-readiness and cross-project warnings.
//   3. Pick audience — debounced Org search; checkbox to acknowledge
//      cross-project warnings; release notes; next review date.
//
// Submit calls POST /api/bundles; closes on success.
// ──────────────────────────────────────────────────────────────────────
export function PublishBundleDialog({
  diagramId,
  diagramName,
  projectId,
  onClose,
  onPublished,
}: Props) {
  // ── Bundle name ───────────────────────────────────────────────────
  const [name, setName] = useState(`${diagramName} — release`);

  // ── Roots picker ──────────────────────────────────────────────────
  const [ownedDiagrams, setOwnedDiagrams] = useState<OwnedDiagram[]>([]);
  const [rootIds, setRootIds] = useState<string[]>([diagramId]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/diagrams-owned`)
      .then(r => r.ok ? r.json() : { diagrams: [] })
      .then(d => { if (!cancelled) setOwnedDiagrams(d.diagrams ?? []); })
      .catch(() => { /* silent — picker just stays empty */ });
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Preview (debounced on rootIds change) ─────────────────────────
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAbortRef = useRef<AbortController | null>(null);
  const refreshPreview = useCallback(async () => {
    if (rootIds.length === 0) { setPreview(null); return; }
    previewAbortRef.current?.abort();
    const ctrl = new AbortController();
    previewAbortRef.current = ctrl;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/bundles/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ projectId, rootDiagramIds: rootIds }),
      });
      if (!res.ok) {
        // 403 / 404 surface as an error string but we keep the dialog usable.
        const err = await res.json().catch(() => ({ error: res.statusText }));
        if (!ctrl.signal.aborted) {
          setPreview(null);
          setError(err.error ?? `Preview failed (${res.status})`);
        }
        return;
      }
      const data = await res.json();
      if (!ctrl.signal.aborted) {
        setPreview(data);
        setError(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (!ctrl.signal.aborted) setPreviewLoading(false);
    }
  }, [projectId, rootIds]);
  useEffect(() => {
    const t = setTimeout(refreshPreview, 200);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  // ── Cross-project link acknowledgement ───────────────────────────
  const [acceptCrossProject, setAcceptCrossProject] = useState(false);

  // ── Audience picker (debounced search) ───────────────────────────
  const [audience, setAudience] = useState<AudienceCandidate[]>([]);
  const [invites, setInvites] = useState<string[]>([]);  // emails for not-yet-registered users
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AudienceCandidate[]>([]);
  const candAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      candAbortRef.current?.abort();
      const ctrl = new AbortController();
      candAbortRef.current = ctrl;
      const excludeIds = audience.map(a => a.id).join(",");
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audience-candidates?q=${encodeURIComponent(query)}&excludeIds=${encodeURIComponent(excludeIds)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const rows = await res.json() as AudienceCandidate[];
        if (!ctrl.signal.aborted) setCandidates(rows);
      } catch { /* silent */ }
    }, 250);
    return () => clearTimeout(t);
  }, [projectId, query, audience]);

  // Detect when the user has typed a complete email that doesn't match
  // any existing user. The audience-candidates endpoint already returns
  // an empty list in that case; we just need to check the query shape.
  const queryLooksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim());
  const queryNormalised = query.trim().toLowerCase();
  const queryAlreadyInvited = invites.includes(queryNormalised) || audience.some(a => a.email.toLowerCase() === queryNormalised);
  const showInviteOption =
    queryLooksLikeEmail
    && candidates.length === 0
    && !queryAlreadyInvited;

  // ── Release notes + next review ──────────────────────────────────
  const [releaseNotes, setReleaseNotes] = useState("");
  const [reviewMode, setReviewMode] = useState<"cadence" | "date" | "none">("none");
  const [cadenceMonths, setCadenceMonths] = useState(12);
  const [reviewDate, setReviewDate] = useState<string>("");
  useEffect(() => {
    if (reviewMode !== "cadence") return;
    const d = new Date();
    d.setMonth(d.getMonth() + cadenceMonths);
    setReviewDate(d.toISOString().slice(0, 10));
  }, [reviewMode, cadenceMonths]);

  // ── Submission ───────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftMembers = useMemo(
    () => (preview?.members ?? []).filter(m => !m.readyToBundle),
    [preview],
  );

  // Convenience: publish all draft members to v1 (or v_next) in sequence.
  // Each call hits the existing per-diagram publish endpoint; release
  // notes are reused as a bulk-publish label.
  const [bulkPublishing, setBulkPublishing] = useState(false);
  async function bulkPublishDrafts() {
    if (draftMembers.length === 0 || bulkPublishing) return;
    setBulkPublishing(true);
    setError(null);
    try {
      for (const m of draftMembers) {
        const res = await fetch(`/api/diagrams/${m.diagramId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseNotes: releaseNotes.trim() || `Initial publish via bundle "${name}"`,
            nextReviewDate: reviewMode !== "none" ? reviewDate || null : null,
            reviewCadenceMonths: reviewMode === "cadence" ? cadenceMonths : null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          setError(`Couldn't publish '${m.name}': ${err.error ?? res.statusText}`);
          return;
        }
      }
      // Re-fetch the preview so the now-published rows flip to ready.
      await refreshPreview();
    } finally {
      setBulkPublishing(false);
    }
  }

  const canSubmit =
    !!preview &&
    preview.summary.draftCount === 0 &&
    rootIds.length > 0 &&
    (audience.length + invites.length) > 0 &&
    name.trim().length > 0 &&
    (preview.summary.crossProjectLinkCount === 0 || acceptCrossProject) &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          projectId,
          rootDiagramIds: rootIds,
          audienceUserIds: audience.map(a => a.id),
          inviteEmails: invites,
          releaseNotes: releaseNotes.trim() || undefined,
          nextReviewDate: reviewMode !== "none" ? reviewDate || null : null,
          acceptCrossProjectWarnings: acceptCrossProject,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setError(err.error ?? `Publish failed (${res.status})`);
        return;
      }
      const { bundleId } = await res.json();
      onPublished(bundleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Publish to business users</h3>
          <p className="text-xs text-gray-700 mt-1">
            Bundles a root diagram (plus everything reachable via process links) and grants view-only
            access to the audience you choose.
          </p>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-4">
          {/* Bundle name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bundle name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            />
          </div>

          {/* Roots */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Roots ({rootIds.length})</div>
            <div className="border border-gray-200 rounded max-h-40 overflow-y-auto">
              {ownedDiagrams.length === 0 && (
                <div className="text-xs text-gray-700 p-2">No diagrams in this project where you are the Diagram Owner.</div>
              )}
              {ownedDiagrams.map(d => {
                const checked = rootIds.includes(d.id);
                const lifecycleChip = d.lifecycle === "PUBLISHED" && d.currentVersion
                  ? `v${d.currentVersion.versionNumber}`
                  : d.lifecycle === "ARCHIVED" ? "Archived" : "Draft";
                return (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setRootIds(prev =>
                          prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id],
                        );
                      }}
                    />
                    <span className="flex-1 truncate text-gray-800">{d.name}</span>
                    <span className="text-[10px] text-gray-700 uppercase font-medium">{d.type}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      d.lifecycle === "PUBLISHED"
                        ? "text-blue-700 border-blue-300 bg-blue-50"
                        : "text-gray-600 border-gray-300 bg-gray-50"
                    }`}>{lifecycleChip}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">
              Closure preview {preview ? `(${preview.summary.totalMembers} diagrams)` : ""}
              {previewLoading && <span className="text-gray-600 ml-2">refreshing…</span>}
            </div>
            {preview && (
              <div className="border border-gray-200 rounded max-h-40 overflow-y-auto">
                {preview.members.map(m => (
                  <div
                    key={m.diagramId}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs border-b border-gray-100 last:border-b-0"
                  >
                    <span className="flex-1 truncate">
                      {m.isRoot && <span className="text-blue-600 font-medium mr-1">root</span>}
                      {m.name}
                    </span>
                    <span className="text-[10px] text-gray-500 uppercase">{m.type}</span>
                    {m.readyToBundle && m.currentVersion ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border text-blue-700 border-blue-300 bg-blue-50">
                        v{m.currentVersion.versionNumber}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border text-orange-700 border-orange-300 bg-orange-50">
                        DRAFT
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {preview && draftMembers.length > 0 && (
              <div className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 flex items-center justify-between">
                <span>{draftMembers.length} diagram{draftMembers.length === 1 ? "" : "s"} not yet published.</span>
                <button
                  onClick={bulkPublishDrafts}
                  disabled={bulkPublishing}
                  className="px-2 py-0.5 text-[11px] font-medium text-white bg-orange-600 hover:bg-orange-700 rounded disabled:opacity-50"
                >
                  {bulkPublishing ? "Publishing…" : "Publish all to v_next"}
                </button>
              </div>
            )}
          </div>

          {/* Cross-project warnings */}
          {preview && preview.crossProjectLinks.length > 0 && (
            <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-2 py-2">
              <div className="font-medium mb-1">
                ⚠ {preview.crossProjectLinks.length} cross-project link{preview.crossProjectLinks.length === 1 ? "" : "s"}
              </div>
              <div className="text-yellow-900 mb-1">
                These elements link to diagrams in other projects — the audience will see dead-end icons on click.
              </div>
              <ul className="ml-3 list-disc text-yellow-900 max-h-20 overflow-y-auto">
                {preview.crossProjectLinks.map((l, i) => (
                  <li key={`${l.fromDiagramId}-${l.fromElementId}-${i}`}>
                    → {l.targetName} <span className="text-yellow-800">(another project)</span>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptCrossProject}
                  onChange={e => setAcceptCrossProject(e.target.checked)}
                />
                <span className="text-yellow-900">I understand — proceed anyway</span>
              </label>
            </div>
          )}

          {/* Audience — existing registered users + invite-by-email entries.
              Audience grants give immediate access. Invites become Pending-
              BundleAudience rows, get an email, and auto-promote on first
              sign-in / registration. */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">
              Audience ({audience.length + invites.length})
              {invites.length > 0 && (
                <span className="text-gray-500 font-normal ml-1">
                  · {invites.length} invitation{invites.length === 1 ? "" : "s"} pending
                </span>
              )}
            </div>
            {(audience.length > 0 || invites.length > 0) && (
              <div className="border border-gray-200 rounded mb-2">
                {audience.map(a => (
                  <div key={a.id} className="flex items-center gap-2 px-2 py-1 text-xs border-b border-gray-100 last:border-b-0">
                    <span className="flex-1 truncate text-gray-800">{a.name ?? a.email} <span className="text-gray-600">{a.email}</span></span>
                    <button
                      onClick={() => setAudience(prev => prev.filter(x => x.id !== a.id))}
                      className="text-gray-600 hover:text-red-600 text-sm"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {invites.map(email => (
                  <div key={`invite:${email}`} className="flex items-center gap-2 px-2 py-1 text-xs border-b border-gray-100 last:border-b-0 bg-blue-50/40">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium shrink-0">
                      INVITE
                    </span>
                    <span className="flex-1 truncate text-gray-800">{email}</span>
                    <button
                      onClick={() => setInvites(prev => prev.filter(x => x !== email))}
                      className="text-gray-600 hover:text-red-600 text-sm"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email, or type a new email to invite…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            />
            {(candidates.length > 0 || showInviteOption) && (
              <div className="border border-gray-200 rounded mt-1 max-h-32 overflow-y-auto">
                {candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setAudience(prev => [...prev, c]);
                      setQuery("");
                      setCandidates([]);
                    }}
                    className="block w-full text-left px-2 py-1 text-xs text-gray-800 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    {c.name ?? c.email} <span className="text-gray-600">{c.email}</span>
                  </button>
                ))}
                {showInviteOption && (
                  <button
                    onClick={() => {
                      setInvites(prev => [...prev, queryNormalised]);
                      setQuery("");
                      setCandidates([]);
                    }}
                    className="block w-full text-left px-2 py-1 text-xs text-gray-800 hover:bg-blue-100 bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 font-medium mr-2">
                      INVITE
                    </span>
                    {queryNormalised} <span className="text-gray-600">— no existing account; they&apos;ll get an email</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Release notes + next review */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Release notes (optional)</label>
            <textarea
              value={releaseNotes}
              onChange={e => setReleaseNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-y"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Next review</div>
            <div className="flex items-center gap-3 text-xs text-gray-800 mb-2">
              <label className="flex items-center gap-1">
                <input type="radio" checked={reviewMode === "cadence"} onChange={() => setReviewMode("cadence")} />
                <span>Cadence</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={reviewMode === "date"} onChange={() => setReviewMode("date")} />
                <span>Specific date</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={reviewMode === "none"} onChange={() => setReviewMode("none")} />
                <span>None</span>
              </label>
            </div>
            {reviewMode === "cadence" && (
              <div className="flex items-center gap-2 text-xs text-gray-800">
                <span>Every</span>
                <input
                  type="number" min={1} max={120}
                  value={cadenceMonths}
                  onChange={e => setCadenceMonths(Math.max(1, Math.min(120, Number.parseInt(e.target.value, 10) || 1)))}
                  className="w-16 border border-gray-300 rounded px-2 py-1"
                />
                <span>months → next review {reviewDate}</span>
              </div>
            )}
            {reviewMode === "date" && (
              <div className="flex items-center gap-2 text-xs text-gray-800">
                <span>Next review on</span>
                <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
              </div>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-40"
          >
            {submitting ? "Publishing…" : `Publish bundle (${preview?.summary.totalMembers ?? 0} diagrams → ${audience.length + invites.length} users)`}
          </button>
        </div>
      </div>
    </div>
  );
}
