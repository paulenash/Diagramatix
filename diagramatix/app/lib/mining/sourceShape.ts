/**
 * Shared shape helpers for live mining sources: which incoming fields the
 * mapping references (the stable column order for buildEventLog), and a
 * client-safe projection that never leaks the key hash, the event buffer, or
 * secret connection config (Blob SAS URL / SharePoint ids).
 */
import type { LogMapping } from "./types";

/** Distinct, non-empty field names referenced by a source's role mapping. */
export function sourceHeaderFields(mapping: Partial<LogMapping>): string[] {
  const fields = [mapping.caseId, mapping.activity, mapping.timestamp, mapping.state, mapping.resource, mapping.controlId, mapping.riskId, mapping.policyId];
  return [...new Set(fields.filter((f): f is string => !!f))];
}

export interface SafeSource {
  id: string; name: string; kind: string;
  apiKeyPrefix: string | null; runId: string | null;
  mapping: unknown; autoRefresh: boolean; eventCount: number;
  lastIngestAt: string | null; lastRefreshAt: string | null;
  hasConfig: boolean; createdAt: string;
}

/** Project a MiningSource row to a client-safe object (no hash / buffer / secret config). */
export function safeSource(s: {
  id: string; name: string; kind: string; apiKeyPrefix: string | null; runId: string | null;
  mapping: unknown; config: unknown; autoRefresh: boolean; eventCount: number;
  lastIngestAt: Date | null; lastRefreshAt: Date | null; createdAt: Date;
}): SafeSource {
  const cfg = (s.config ?? {}) as Record<string, unknown>;
  return {
    id: s.id, name: s.name, kind: s.kind, apiKeyPrefix: s.apiKeyPrefix, runId: s.runId,
    mapping: s.mapping, autoRefresh: s.autoRefresh, eventCount: s.eventCount,
    lastIngestAt: s.lastIngestAt ? s.lastIngestAt.toISOString() : null,
    lastRefreshAt: s.lastRefreshAt ? s.lastRefreshAt.toISOString() : null,
    hasConfig: Object.keys(cfg).length > 0,
    createdAt: s.createdAt.toISOString(),
  };
}
