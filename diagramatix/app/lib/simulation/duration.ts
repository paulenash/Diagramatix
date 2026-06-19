/**
 * ISO-8601 duration ⇄ base-time-unit conversion.
 *
 * BPSim encodes every time as an xsd:duration (e.g. "PT24M", "PT60H", "P1DT2H")
 * against a base time unit, not as a raw number. The engine works in plain
 * numbers (a chosen ClockUnit); these helpers convert at the BPSim boundary
 * (import/export). We support the day/hour/minute/second components — the
 * year/month components are calendar-ambiguous and not used by process timing.
 */

import { type ClockUnit, SECONDS_PER_UNIT } from "./types";

// P[nD]T[nH][nM][nS] — integer or decimal components; T section optional.
const ISO_RE =
  /^(-)?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Parse an ISO-8601 duration into seconds. Throws on malformed input. */
export function isoToSeconds(iso: string): number {
  const m = ISO_RE.exec(iso.trim());
  if (!m || (m[2] === undefined && m[3] === undefined && m[4] === undefined && m[5] === undefined)) {
    throw new Error(`Invalid ISO-8601 duration: "${iso}"`);
  }
  const sign = m[1] ? -1 : 1;
  const d = parseFloat(m[2] ?? "0");
  const h = parseFloat(m[3] ?? "0");
  const min = parseFloat(m[4] ?? "0");
  const s = parseFloat(m[5] ?? "0");
  return sign * (d * 86400 + h * 3600 + min * 60 + s);
}

/** Format seconds as a compact ISO-8601 duration (e.g. 1440s → "PT24M"). */
export function secondsToIso(totalSeconds: number): string {
  if (totalSeconds === 0) return "PT0S";
  const sign = totalSeconds < 0 ? "-" : "";
  let rem = Math.abs(totalSeconds);
  const days = Math.floor(rem / 86400); rem -= days * 86400;
  const hours = Math.floor(rem / 3600); rem -= hours * 3600;
  const mins = Math.floor(rem / 60); rem -= mins * 60;
  const secs = Math.round(rem * 1e6) / 1e6; // tidy float noise
  let out = `${sign}P`;
  if (days) out += `${days}D`;
  if (hours || mins || secs || !days) {
    out += "T";
    if (hours) out += `${hours}H`;
    if (mins) out += `${mins}M`;
    if (secs || (!hours && !mins)) out += `${secs}S`;
  }
  return out;
}

/** ISO-8601 duration → a number in `unit`. */
export function isoToUnit(iso: string, unit: ClockUnit): number {
  return isoToSeconds(iso) / SECONDS_PER_UNIT[unit];
}

/** A number in `unit` → ISO-8601 duration. */
export function unitToIso(value: number, unit: ClockUnit): string {
  return secondsToIso(value * SECONDS_PER_UNIT[unit]);
}
