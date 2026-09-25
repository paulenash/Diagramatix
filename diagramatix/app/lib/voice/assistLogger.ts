/**
 * Voice Assist logger — speaks each log entry using spokenText transform + speaker.
 *
 * Called from DiagramEditor's log() when a Voice Assist command completes.
 * Decides whether to speak based on verbosity, transforms the summary, queues playback.
 */

import { spokenText, type SpeechVerbosity } from "./spokenText";
import { speaker } from "./speaker";
import type { TtsVoice } from "./speakParams";

/**
 * Speak a Voice Assist log entry if it matches the verbosity filter.
 *
 * @param summary the log line (e.g., "added Task 1 after Receive Order")
 * @param ok true if the command succeeded, false if it failed (refused)
 * @param voice the TTS voice to use
 * @param verbosity what should be spoken (off/questions/problems/everything)
 * @param enabled whether speak is turned on
 */
export function speakLogEntry(
  summary: string,
  ok: boolean,
  voice: TtsVoice,
  verbosity: SpeechVerbosity,
  enabled: boolean
): void {
  if (!enabled || verbosity === "off") return;

  const toSpeak = spokenText(summary, verbosity);
  if (!toSpeak) return; // filtered out by verbosity

  // Determine the purpose (question, refusal, or success)
  let purpose: "question" | "refusal" | "success" = "success";
  if (summary.includes("?")) purpose = "question";
  else if (!ok) purpose = "refusal";

  speaker.speak(toSpeak, voice, purpose);
}
