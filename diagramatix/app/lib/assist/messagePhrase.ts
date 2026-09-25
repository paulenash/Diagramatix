/**
 * The "add a message" sentences that do NOT name both ends — read by the
 * command grammar (to open the numbered picker, or to decline) and by the hold
 * (`incompleteCommand.ts`, which must not wait for a "from … to …" that the
 * by-number form never needs). The hold had its own copy of the by-number
 * pattern; two copies of one sentence is how "add the message" came to open a
 * task in one and be held in the other.
 *
 * Pure.
 */
import { MESSAGE_WORDS, wordAlternation } from "./containerWords";

/**
 * The verbs a message sentence starts with ("add a message …", "send a
 * message …"). Regex source, read by these patterns and by the grammar's
 * from/to message rules, so a verb added here is a message verb everywhere.
 */
export const MESSAGE_VERB = "(?:add|create|draw|put|send)";
/** "message", "messages", "msg", "message flow". */
export const MESSAGE_NOUN = `(?:${wordAlternation(MESSAGE_WORDS)})s?(?:\\s+flow)?`;
const SELECTION = "(?:to|from|for|with|on)\\s+(?:the\\s+)?(?:selected(?:\\s+\\w+)?|selection|this|that|these|it)";

/**
 * Message by number (Paul, 2026-09-15): "add a message" numbers every
 * candidate and waits for "n to m labelled X". "The" and the plural are the
 * same request ("add the message", "add messages") — without them both made a
 * TASK called "message(s)".
 */
export const MESSAGE_BY_NUMBER = new RegExp(`^${MESSAGE_VERB}\\s+(?:(?:a|the|new)\\s+)?${MESSAGE_NOUN}\\s*$`, "i");

/** "add a message to the selected" — numbers the selection's valid counterparts. */
export const MESSAGE_BY_NUMBER_FROM_SELECTION = new RegExp(`^${MESSAGE_VERB}\\s+(?:(?:a|the|new)\\s+)?${MESSAGE_NOUN}\\s+${SELECTION}\\s*$`, "i");

/**
 * Any "add a message …" at all: the message word is the verb's OBJECT. A
 * phrasing the message rules could not read must NOT fall through to the
 * generic add, which would make a task called "Message" — or "messages from
 * review to customer", or "new message from review to customer".
 *
 * The hold asks the same question — is this a message sentence still waiting
 * for its ends? — and must ask it of the object only. Asked of the message
 * word ANYWHERE after the verb, "add a task called Receive Messages" was held
 * for the whole grace period, and the next command, spoken in that window,
 * was stitched into the task's name and never ran.
 */
export const ADD_MESSAGE_LEAD = new RegExp(`^${MESSAGE_VERB}\\s+(?:(?:a|an|the)\\s+)?(?:(?:new|another)\\s+)?${MESSAGE_NOUN}\\b`, "i");
