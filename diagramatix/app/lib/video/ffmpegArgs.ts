/**
 * Pure ffmpeg argument builder for the Screencast Studio server transcode
 * (webm/VP8-9 + Opus → mp4/H.264 + AAC). Kept side-effect-free so the arg list
 * is unit-testable without spawning a process.
 *
 * Choices:
 *  - libx264 veryfast + crf 23 — a good size/quality/speed balance for screencasts.
 *  - yuv420p — required for QuickTime / most social players.
 *  - aac 128k — universal audio.
 *  - +faststart — moves the moov atom to the front so the mp4 streams/plays
 *    before it's fully downloaded (and social/CDN previews work).
 */
export function ffmpegWebmToMp4Args(inputPath: string, outputPath: string): string[] {
  return [
    "-i", inputPath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];
}
