/**
 * Which steps are WAITING ON SOMEONE ELSE rather than doing work.
 *
 * A Receive task and a Message catch event both mean the same thing: the process
 * has asked an outside party for something and is waiting for the answer. That
 * is not work, and it does not behave like work.
 *
 * Work is bounded and clusters around a typical duration, which is why the flat
 * default for a task is triangular(3,5,8) — never under 3, never over 8. An
 * external reply has neither property. It can come back in seconds or not for
 * hours, and — the part that matters — it is MEMORYLESS: having already waited
 * half an hour tells you nothing about how much longer it will take, because the
 * person on the other end is not working to your clock.
 *
 * The exponential distribution is exactly that shape, so it is the honest
 * default here. Triangular claims the reply always arrives inside a narrow band,
 * which for a human answering an email is not a small error — it removes the
 * long tail that makes chasing, timeouts and escalation paths worth modelling at
 * all, and those are usually the reason the process was drawn.
 *
 * This is a DEFAULT, not a constraint: every value stays editable, and the
 * number below is a placeholder. The shape is the part worth getting right.
 */

import type { DiagramElement } from "@/app/lib/diagram/types";
import type { SimDist } from "@/app/lib/diagram/simParams";

/**
 * Placeholder mean for an external reply, in the run's clock unit (minutes by
 * default). One hour — long enough to read as "someone else's time, not ours",
 * and the same value already used for boundary triggers, which wait on the
 * outside world for the same reason.
 *
 * Change it per model: a customer email is hours, an API callback is seconds.
 */
export const DEF_EXTERNAL_WAIT: SimDist = { kind: "exponential", mean: 60 };

/**
 * Is this element waiting on an external party?
 *
 * A BOUNDARY message event is excluded: it races its host rather than being the
 * step itself, and already has its own trigger distribution.
 */
export function isExternalWait(el: DiagramElement): boolean {
  if (el.boundaryHostId) return false;
  if (el.type === "task") return el.taskType === "receive";
  if (el.type === "intermediate-event") return el.eventType === "message";
  return false;
}
