/**
 * Two vocabularies that used to overlap on one word.
 *
 * Paul, 2026-09-15: "The command 'stop' is ambiguous. It can mean stop rename
 * when a group of elements is numbered or it can mean stop listening."
 *
 * Now: a MIC word ends listening — always, whatever flow is open (and the open
 * flow is dropped with it). A FLOW word ends only the numbered pick (rename by
 * number, message by number) and leaves the microphone on. "stop" is a mic
 * word and nothing else; "stop rename" is the flow word for people who say it.
 */
const MIC = /^(?:stop|stop listening|stop it|that'?s enough|pause|voice-assist off|thank you gort)\b/i;
const FLOW = /^(?:done|finished|that'?s all|all done|enough|cancel|never ?mind|stop rename|stop numbering|quit|exit|forget it|abort|escape)\b/i;

const clean = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");

/** "stop" / "stop listening" / "that's enough" / "voice-assist off" — end the session. */
export const isMicStopWord = (utterance: string): boolean => MIC.test(clean(utterance));
/** "done" / "cancel" / "never mind" / "stop rename" — end the numbered pick, keep listening. */
export const isFlowEndWord = (utterance: string): boolean => FLOW.test(clean(utterance));
