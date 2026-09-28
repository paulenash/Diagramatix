"use client";

/**
 * Re-attach a diagram's kept source image when it is re-generated — once, and
 * never over a choice the user made while it was loading.
 *
 * Both generate consoles use this (PlanPanel, AiPanel), so the guard lives in
 * one place. The review of 2026-09-28 found the load had none: attaching a
 * different file, removing the attachment, clearing for a new prompt or
 * loading a saved one before the stored image arrived was silently undone when
 * it did — and Plan could run without the image, the very failure this exists
 * to fix. So every such action cancels the load, and `pending` (the image's
 * name while it loads) lets the console hold Plan until it has arrived.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSourceImage, type StoredSourceImage } from "@/app/lib/ai/sourceImage";

export function useReattachSourceImage(diagramId: string | undefined) {
  const token = useRef(0);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => () => { token.current += 1; }, []);

  /** Drop a load still in flight — the user attached, removed or cleared. */
  const cancel = useCallback(() => { token.current += 1; setPending(null); }, []);

  const start = useCallback((
    stored: StoredSourceImage,
    onLoaded: (img: { data: string; mediaType: string }) => void,
    onMissing: () => void,
  ) => {
    const mine = ++token.current;
    if (!diagramId) { setPending(null); onMissing(); return; }
    setPending(stored.name);
    void loadSourceImage(diagramId, stored).then((img) => {
      if (mine !== token.current) return;
      setPending(null);
      if (img) onLoaded(img); else onMissing();
    });
  }, [diagramId]);

  return { start, cancel, pending };
}
