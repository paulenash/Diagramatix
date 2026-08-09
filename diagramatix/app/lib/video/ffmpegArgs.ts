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
 *
 * Audio/video sync: MediaRecorder webm is VARIABLE frame rate with real PTS
 * timestamps. `-fps_mode passthrough` preserves those exact timestamps (rather
 * than forcing a constant rate, which drops/dupes frames and shifts alignment),
 * and `-af aresample=async=1:first_pts=0` keeps the audio clock locked to the
 * video timeline — compensating for a mic track that started a beat after the
 * screen capture, so audio and video stay in sync end-to-end.
 */
export function ffmpegWebmToMp4Args(inputPath: string, outputPath: string): string[] {
  return [
    "-i", inputPath,
    "-fps_mode", "passthrough",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-af", "aresample=async=1:first_pts=0",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];
}

/**
 * Transcode any input (mp4 or webm) → webm (VP9 + Opus). `realtime`/`cpu-used 5`
 * + row multithreading keep VP9 — which is otherwise very slow — usable for a
 * screencast-length clip. Only used for the optional "convert to .webm" action.
 */
export function ffmpegToWebmArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-i", inputPath,
    "-fps_mode", "passthrough",   // preserve the source's real (variable) frame timing
    "-c:v", "libvpx-vp9",
    "-b:v", "0", "-crf", "33",
    "-deadline", "realtime", "-cpu-used", "5", "-row-mt", "1",
    "-c:a", "libopus", "-b:a", "128k",
    "-af", "aresample=async=1:first_pts=0",   // keep audio locked to the video timeline
    "-y",
    outputPath,
  ];
}

