/**
 * What to do with a transcript that arrives while Diagramatix may be speaking (plan layers 2 and 3).
 *
 *   • not gated            → "pass": the transcript is a command, as always.
 *   • gated, a stop word   → "bargeIn": cut the voice off at once, then handle the word as usual ("stop" ends the
 *                            microphone, "cancel" / "done" close what is open).
 *   • gated, anything else → "ignore": it is the voice itself coming back through the microphone. It must not reach
 *                            the fragment buffer or the parser.
 *
 * Pure.
 */
import { isFlowEndWord, isMicStopWord } from "@/app/lib/assist/stopWords";

export type EchoVerdict = "pass" | "bargeIn" | "ignore";

export function echoVerdict(text: string, gated: boolean): EchoVerdict {
  if (!gated) return "pass";
  const t = text.trim();
  if (isMicStopWord(t) || isFlowEndWord(t)) return "bargeIn";
  return "ignore";
}
