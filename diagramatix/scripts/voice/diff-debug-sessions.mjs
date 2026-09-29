#!/usr/bin/env node
/**
 * Compare two Voice Assist debug-session downloads (the 🪄 bar's debug
 * recording → Download) — to prove a change to the voice session changed
 * nothing: the same typed script, before and after, must record the same
 * session (Stage 4 of mobile voice, 2026-09-29).
 *
 *   node scripts/voice/diff-debug-sessions.mjs before.json after.json
 *
 * Everything that differs from run to run anyway is normalised first: ids
 * (element, connector, log line, snapshot — renamed in the order they first
 * appear), times, PNG screenshots, and the app version. Prints "SAME" and exits
 * 0, or prints the first differences and exits 1.
 */
import { readFileSync } from "node:fs";

const [, , a, b] = process.argv;
if (!a || !b) { console.error("usage: node scripts/voice/diff-debug-sessions.mjs before.json after.json"); process.exit(2); }

const TIME_KEYS = /^(at|takenAt|savedAt|createdAt|updatedAt|exportedAt|startedAt|generatedAt|ms|elapsedMs|durationMs)$/;
// png: screenshots; pointer: where the mouse happened to be on the canvas.
const DROP_KEYS = /^(png|appVersion|productVersion|userAgent|pointer)$/;
const ID_LIKE = /^[A-Za-z0-9_-]{8,32}$/;

function normalise(root) {
  const ids = new Map();
  const idFor = (v) => { if (!ids.has(v)) ids.set(v, `id${ids.size + 1}`); return ids.get(v); };
  // Ids are numbered where they are DEFINED (an object's own "id"), in order —
  // so a reference to one elsewhere (voiceLastId, selectedIds …) cannot shift
  // the numbering of everything after it. Then any id-like reference left.
  const collect = (defsOnly) => (function walk(v, key) {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
    if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, k); return; }
    if (typeof v !== "string" || !ID_LIKE.test(v)) return;
    if (defsOnly ? key === "id" : /(Id$|Ids$|^ids$)/.test(key)) idFor(v);
  })(root, "");
  collect(true);
  collect(false);
  const swap = (s) => { let out = s; for (const [id, n] of ids) if (out.includes(id)) out = out.split(id).join(n); return out; };
  return (function walk(v, key) {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v).sort()) {
        if (DROP_KEYS.test(k)) continue;
        o[k] = TIME_KEYS.test(k) ? "<time>" : walk(v[k], k);
      }
      return o;
    }
    return typeof v === "string" ? swap(v) : v;
  })(root, "");
}

const lines = (f) => JSON.stringify(normalise(JSON.parse(readFileSync(f, "utf8"))), null, 1).split("\n");
const x = lines(a), y = lines(b);
const diffs = [];
for (let i = 0; i < Math.max(x.length, y.length) && diffs.length < 20; i++) if (x[i] !== y[i]) diffs.push(`line ${i + 1}\n  before: ${x[i] ?? "(end)"}\n  after:  ${y[i] ?? "(end)"}`);
if (!diffs.length) { console.log("SAME — the two sessions recorded the same commands, log lines and diagram states."); process.exit(0); }
console.log(`DIFFERENT — first ${diffs.length} difference(s):\n` + diffs.join("\n"));
process.exit(1);
