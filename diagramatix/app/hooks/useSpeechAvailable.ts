/**
 * Whether this user may hear Diagramatix speak — asked once per tab (the answer
 * is held for the tab's life, so a grant made meanwhile shows after a reload).
 *
 * `null` while the answer is on its way, so a surface can draw nothing rather
 * than flash a speech control that then disappears. A failed request counts as
 * "no": speech is off by default, and a doubtful answer should look like that.
 */

import { useEffect, useState } from "react";

let cached: Promise<boolean> | null = null;

function ask(): Promise<boolean> {
  cached ??= fetch("/api/ai/speak", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => j.available === true)
    .catch(() => false);
  return cached;
}

export function useSpeechAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void ask().then((a) => { if (alive) setAvailable(a); });
    return () => { alive = false; };
  }, []);
  return available;
}
