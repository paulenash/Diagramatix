/**
 * POST /api/video/transcode — Screencast Studio server transcode (webm → mp4).
 *
 * The client records a webm (VP8/9 + Opus) via MediaRecorder; social platforms
 * (and Buffer) need mp4/H.264. This route spawns ffmpeg (installed in the Docker
 * image) to transcode. Body = the raw webm bytes; response = the mp4 bytes.
 *
 * SuperAdmin-only by REAL identity (`isSuperuser`) — a downgraded SuperAdmin view
 * mode must not lock the real SuperAdmin out of their own transcode.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegWebmToMp4Args } from "@/app/lib/video/ffmpegArgs";

export const runtime = "nodejs";
export const maxDuration = 300;

// Guard against absurd uploads (a screencast is minutes, not gigabytes).
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Recording too large to transcode" }, { status: 413 });

  const dir = await mkdtemp(join(tmpdir(), "dgx-video-"));
  const inPath = join(dir, "in.webm");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, buf);
    await runFfmpeg(ffmpegWebmToMp4Args(inPath, outPath));
    const mp4 = await readFile(outPath);
    return new NextResponse(new Uint8Array(mp4), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="screencast.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcode failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errTail = "";
    proc.stderr.on("data", (d: Buffer) => {
      errTail += d.toString();
      if (errTail.length > 8000) errTail = errTail.slice(-8000);
    });
    proc.on("error", (e) => reject(new Error(`ffmpeg could not be started (${e.message}). Is ffmpeg installed?`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${errTail.slice(-500)}`));
    });
  });
}
