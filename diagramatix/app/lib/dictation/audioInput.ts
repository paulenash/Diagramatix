/**
 * Audio / transcript → text helpers for the "audio → diagram" flow.
 *  - transcribeAudioBlob: send a recording to the server (Deepgram pre-recorded).
 *  - parseVtt: parse a Microsoft Teams .vtt transcript client-side (no server /
 *    transcription cost; keeps real speaker names).
 */

/** Send recorded/uploaded audio to the server for transcription. */
export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const res = await fetch("/api/ai/audio/transcribe", {
    method: "POST",
    headers: { "Content-Type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Transcription failed (${res.status})`);
  }
  const { transcript } = await res.json();
  return (transcript ?? "").trim();
}

/**
 * Parse a WebVTT transcript into speaker-labelled plain text. Microsoft Teams
 * marks the speaker with a `<v Name>…</v>` voice tag; a leading "Name:" is also
 * handled. Cue timestamps / indices / NOTE blocks are stripped, and consecutive
 * cues from the same speaker are merged into one line.
 */
export function parseVtt(vtt: string): string {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const cues: { speaker: string | null; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("-->")) continue;
    // Cue text is the following non-blank lines.
    const textLines: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== "") { textLines.push(lines[i]); i++; }
    cues.push(extractCue(textLines.join(" ").trim()));
  }

  const out: string[] = [];
  let curSpeaker: string | null = null;
  let buf: string[] = [];
  const flush = () => { if (buf.length) out.push((curSpeaker ? `${curSpeaker}: ` : "") + buf.join(" ")); buf = []; };
  for (const c of cues) {
    if (!c.text) continue;
    if (c.speaker !== curSpeaker) { flush(); curSpeaker = c.speaker; }
    buf.push(c.text);
  }
  flush();
  return out.join("\n");
}

function extractCue(raw: string): { speaker: string | null; text: string } {
  const v = raw.match(/<v\s+([^>]+)>([\s\S]*?)<\/v>/i);
  if (v) return { speaker: v[1].trim(), text: stripTags(v[2]) };
  const m = raw.match(/^([A-Z][\w .'-]{1,40}?):\s+(.*)$/);
  if (m) return { speaker: m[1].trim(), text: stripTags(m[2]) };
  return { speaker: null, text: stripTags(raw) };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/** True for files we treat as a WebVTT transcript. */
export function isVttFile(file: File): boolean {
  return /\.vtt$/i.test(file.name) || file.type === "text/vtt";
}
