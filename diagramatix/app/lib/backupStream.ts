import { type BackupProgressFn } from "./full-backup";

/**
 * Wrap a backup builder in an NDJSON streaming Response so the client can
 * show live per-section progress.
 *
 * Wire protocol — one JSON object per line:
 *   { "t": "progress", "label": "Diagram", "count": 197 }   // per section
 *   { "t": "progress", "label": "Compressing", "count": 0 } // final build step
 *   { "t": "done", "filename": "...", "counts": {…}, "bytes": N, "data": "<base64 zip>" }
 *   { "t": "error", "message": "…" }
 *
 * The whole zip is delivered base64-encoded in the terminal `done` line — at
 * pilot scale (a few MB) that's simpler and more robust than trying to mux
 * binary file chunks into the same text stream. The client decodes it and
 * triggers the download once progress completes.
 */
export function streamBackup(
  build: (onProgress: BackupProgressFn) => Promise<Uint8Array>,
  filename: string,
): Response {
  const encoder = new TextEncoder();
  const counts: Record<string, number> = {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const bytes = await build((label, count) => {
          if (label !== "Compressing") counts[label] = count;
          line({ t: "progress", label, count });
        });
        const data = Buffer.from(bytes).toString("base64");
        line({ t: "done", filename, counts, bytes: bytes.length, data });
      } catch (err) {
        line({ t: "error", message: err instanceof Error ? err.message : "Backup failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Defeat proxy/CDN buffering so progress lines arrive live.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
