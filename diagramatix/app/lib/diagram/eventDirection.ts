/**
 * Is this event a THROW (it sends) or a CATCH (it receives)?
 *
 * One reading, the one the canvas draws: SymbolRenderer fills the trigger
 * marker of a throwing event, and this is the test it fills it on. So the
 * message rule (canConnect.ts), the drag highlight and the renderer agree with
 * what Paul sees on the diagram — "Message 2 Arrives" has no Flow Type and is
 * drawn as a catch, so it is not a throw here either.
 *
 * `taskType: "send"` with no Flow Type is the legacy spelling of a throw (the
 * reducer's message conversion used to stamp only that); an explicit Flow Type
 * always wins over it.
 *
 * Known elsewhere and NOT yet on this reading: exportBpmnXml (Flow Type only)
 * and the Visio maps.
 */
import type { DiagramElement } from "./types";

export const isThrowingEvent = (el: Pick<DiagramElement, "flowType" | "taskType">): boolean =>
  el.flowType === "throwing" || (el.flowType == null && el.taskType === "send");

/** Only an explicit "catching" fixes an event as a receiver. Unset and "none"
 *  leave the direction open (Paul, 2026-09-25: "Convertible"). */
export const isCatchingEvent = (el: Pick<DiagramElement, "flowType">): boolean =>
  el.flowType === "catching";
