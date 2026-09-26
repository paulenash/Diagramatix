/**
 * Which side of an event a connector may use — the one rule, for voice now and
 * for the mouse when it asks.
 *
 * Paul, 2026-09-27: "Start Events should never allow move an outgoing
 * connector to 'left'. End Event should never allow move an incoming
 * connector to 'right'." A Start's flow leaves forward; an End's flow arrives
 * from behind. The left of a Start and the right of an End face nothing.
 *
 * Pure.
 */
import type { Side } from "./types";

/** Why this move is not allowed, or null when it is. */
export function eventSideRefusal(eventType: string, role: "source" | "target", side: Side): string | null {
  if (eventType === "start-event" && role === "source" && side === "left") return "a Start Event’s flow never leaves to the left";
  if (eventType === "end-event" && role === "target" && side === "right") return "an End Event’s flow never arrives from the right";
  return null;
}
