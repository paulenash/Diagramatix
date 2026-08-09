/**
 * ffmpeg arg builder (pure) — app/lib/video/ffmpegArgs.ts.
 */
import { describe, it, expect } from "vitest";
import { ffmpegWebmToMp4Args, ffmpegToWebmArgs } from "@/app/lib/video/ffmpegArgs";

describe("ffmpegWebmToMp4Args", () => {
  it("T0975 — builds a web-friendly H.264/AAC mp4 transcode with faststart", () => {
    const args = ffmpegWebmToMp4Args("/tmp/in.webm", "/tmp/out.mp4");
    // input then output, with the key codec + compatibility flags present.
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/tmp/in.webm");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");      // QuickTime/social compatibility
    expect(args).toContain("aac");
    // +faststart must follow -movflags for streamable mp4.
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    // -y so a stale temp file never blocks the transcode.
    expect(args).toContain("-y");
  });

  it("T2251 — preserves VFR timestamps + async-resamples audio so A/V stays in sync", () => {
    const args = ffmpegWebmToMp4Args("/tmp/in.webm", "/tmp/out.mp4");
    // Passthrough keeps MediaRecorder's real (variable) frame timing rather than
    // forcing a constant rate (which would drop/dupe frames and shift alignment).
    expect(args[args.indexOf("-fps_mode") + 1]).toBe("passthrough");
    // async audio resample compensates a mic track that started a beat late.
    expect(args[args.indexOf("-af") + 1]).toBe("aresample=async=1:first_pts=0");
  });

  it("T0976 — builds a VP9/Opus webm transcode tuned for reasonable speed", () => {
    const args = ffmpegToWebmArgs("/tmp/in.mp4", "/tmp/out.webm");
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/tmp/in.mp4");
    expect(args[args.length - 1]).toBe("/tmp/out.webm");
    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("libopus");
    // realtime deadline keeps otherwise-glacial VP9 usable for a screencast.
    expect(args[args.indexOf("-deadline") + 1]).toBe("realtime");
    // same A/V-sync handling as the mp4 path.
    expect(args[args.indexOf("-fps_mode") + 1]).toBe("passthrough");
    expect(args[args.indexOf("-af") + 1]).toBe("aresample=async=1:first_pts=0");
  });
});
