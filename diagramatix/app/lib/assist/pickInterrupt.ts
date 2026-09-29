/**
 * A whole new command said while the "which one? say a number" question is up
 * is that command — not a wrong answer.
 *
 * Paul's boundary session, 2026-09-27: "top boundary up one hundred" opened
 * "which “the pool”? say a number (1–4)", and his next four attempts — "move
 * selected lines top boundary", "up one hundred", "move underwriters team
 * lane", "top boundary up one hundred" — were each read as an answer, failed
 * as one, and repeated the question, until he said "done". The picker kept
 * the microphone to itself.
 *
 * So an utterance that is not an answer (no number, no candidate's name) but
 * IS a complete command closes the question and runs. An answer is always
 * tried first, so "two", "Customer" and "number 3" still pick.
 *
 * Pure.
 */
import { parseCommand } from "./commandGrammar";
import { parsePickAnswer, type PickFlow } from "./disambiguate";
import { parseNumberList } from "./numberList";

export function interruptsPick(heard: string, flow: PickFlow): boolean {
  // A delete's question is answered with a LIST of numbers; that is the answer, not a new command.
  if (flow.many && parseNumberList(heard, flow.targets.length)) return false;
  if (parsePickAnswer(heard, flow)) return false;
  return parseCommand(heard) !== null;
}
