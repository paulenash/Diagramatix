/**
 * The Start event of an EVENT expanded subprocess is NAMED (Paul, 2026-10-03).
 *
 * A Start or End event inside an ordinary expanded subprocess is conventionally unnamed — the subprocess's own name is the
 * boundary. The exception is the Start event of an EVENT subprocess (Usage = Event): it says what triggers the subprocess, so
 * it has a name, "Event occurs" by default, and can be renamed. The exception is for START events only — an End event inside
 * an Event subprocess is still unnamed.
 *
 * Pure. Shared by the reducer (a Start dropped inside an Event EP; an EP whose Usage becomes Event), the voice add of an
 * Event EP, and the AI layout's fabricated Start.
 */
import type { DiagramElement } from "./types";

/** What an Event subprocess's Start is called until it is renamed. */
export const EVENT_EP_START_LABEL = "Event occurs";

/** An expanded subprocess whose Usage is Event. */
export const isEventEp = (e: Pick<DiagramElement, "type" | "properties">): boolean =>
  e.type === "subprocess-expanded" && (e.properties as { subprocessType?: string } | undefined)?.subprocessType === "event";
