"use client";

/**
 * Account-settings control for the per-user "bring-your-own AI key".
 *
 * Reads GET /api/account/ai-keys, which returns the last four characters of
 * each stored key and never the key itself — so this component has no way to
 * display one, by construction rather than by discipline.
 *
 * It also has to say plainly WHOSE key pays. A user who supplied a key and is
 * quietly billed to Diagramatix has been misled; so has one who supplied
 * nothing and assumes they are covered.
 */
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface StoredKey {
  provider: string;
  providerLabel: string;
  keyHint: string;
  baseUrl: string | null;
  lastUsedAt: string | null;
}
interface ProviderOption { id: string; label: string }

export function AiKeySettings() {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StoredKey | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/ai-keys");
      if (!r.ok) return;
      const d = await r.json();
      setKeys(d.keys ?? []);
      setProviders(d.providers ?? []);
      setStorageConfigured(d.storageConfigured !== false);
      if (d.providers?.length) setProvider((p) => p || d.providers[0].id);
    } catch { /* leave prior state */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/account/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: key.trim(), baseUrl: baseUrl.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? "Could not save the key."); return; }
      setKeys(d.keys ?? []);
      setKey(""); setBaseUrl(""); setOpen(false);
    } catch {
      setErr("Could not reach the server.");
    } finally { setBusy(false); }
  };

  const remove = async (p: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/account/ai-keys?provider=" + encodeURIComponent(p), { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setKeys(d.keys ?? []);
    } finally { setBusy(false); setConfirmRemove(null); }
  };

  const used = (iso: string | null) =>
    iso ? "last used " + new Date(iso).toLocaleDateString() : "not used yet";

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-700 mb-2">Your own AI keys</p>

      {keys.length > 0 ? (
        <div className="space-y-1.5 mb-2">
          {keys.map(k => (
            <div key={k.provider} className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-600 truncate">
                <span className="font-medium text-gray-800">{k.providerLabel}</span>
                <span className="text-gray-400"> &middot;&middot;&middot;&middot;{k.keyHint}</span>
                <span className="text-[10px] text-gray-400"> &middot; {used(k.lastUsedAt)}</span>
              </p>
              <button onClick={() => setConfirmRemove(k)} disabled={busy}
                className="shrink-0 px-2.5 py-1 text-[11px] font-medium text-red-700 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50">
                Remove
              </button>
            </div>
          ))}
          <p className="text-[10px] text-gray-500">
            AI you run on these providers is billed to your account, not to Diagramatix.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-2">
          Optional. Add a key and AI generation on that provider is billed to you instead of
          counting against your Diagramatix allowance.
        </p>
      )}

      {!storageConfigured ? (
        <p className="text-[11px] text-amber-600">
          Key storage is not configured on this deployment, so a key cannot be stored securely yet.
        </p>
      ) : !open ? (
        <button onClick={() => { setOpen(true); setErr(null); }}
          className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
          Add a key
        </button>
      ) : (
        <div className="space-y-2 border border-gray-200 rounded p-2.5 bg-gray-50">
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">API key</label>
            {/* type=password so it is not shoulder-read or caught by a screen
                recording. It is write-only regardless — nothing can read it
                back out once saved, including this component. */}
            <input type="password" value={key} autoComplete="off"
              onChange={e => setKey(e.target.value)}
              placeholder="sk-..."
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">
              Endpoint <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input type="text" value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="Leave blank for the provider's own endpoint"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy || !key.trim()}
              className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Saving..." : "Save key"}
            </button>
            <button onClick={() => { setOpen(false); setKey(""); setBaseUrl(""); setErr(null); }}
              className="px-2.5 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100">
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-gray-500">
            Stored encrypted. It is never shown again &mdash; only the last four characters.
          </p>
        </div>
      )}

      {confirmRemove && (
      <ConfirmDialog
        title="Remove this key?"
        message={"Your " + confirmRemove.providerLabel + " key (····" + confirmRemove.keyHint +
          ") will be deleted. AI on that provider will go back to being billed to Diagramatix and counting against your allowance."}
        confirmLabel="Remove"
        destructive
        onConfirm={() => remove(confirmRemove.provider)}
        onCancel={() => setConfirmRemove(null)}
      />
      )}
    </div>
  );
}
