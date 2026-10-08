/**
 * Two things a repository prompt can ask for that BPMN does not allow.
 *
 * Paul, 2026-09-03, reading V22.07: a message "in the middle of nowhere … A
 * missing Black-box Pool???", and an event that "should be an EMIE on Task
 * 'Escalate to delegated approver' probably?". Both were faithful renderings of
 * what the PROMPT asked for, so no amount of layout or generation work could
 * have fixed them — the instruction itself was wrong.
 *
 * Deterministic and free, like `checkPromptBranches`, so a prompt can be gated
 * on it rather than inspected. Both checks read the prompt's own house style,
 * which the master template fixes:
 *
 *   5. Edge-mounted (boundary) events
 *      "<interrupting|non-interrupting> <type> boundary event on <HOST>"
 *   6. Connectors → "Message flows:"
 *      "<source> → <target> (<what is carried>)"
 */

/** One instruction that cannot be drawn. */
export interface ShapeIssue {
  /** 1-based line of the offending instruction. */
  line: number;
  kind: "boundary-on-non-activity" | "message-within-pool" | "boundary-leaves-subprocess" | "boundary-straight-to-end" | "exception-end-not-terminate";
  detail: string;
}

/**
 * A boundary event may be mounted ONLY on an activity — a task or a subprocess.
 * These are the words that name something else, so a host beginning with one is
 * an instruction the generator cannot carry out.
 */
const NOT_AN_ACTIVITY =
  /^(intermediate|message start|timer start|start event|end event|exclusive|inclusive|parallel|event[- ]based|terminate|escalation end|error end)\b/i;

/** The section-6 form for a message flow: "<a> → <b> (<payload>)". */
const MESSAGE_ARROW = /^(.*?)\s*(?:→|->)\s*(.*)$/;

export function checkPromptShapes(prompt: string, advice = false): ShapeIssue[] {
  const lines = prompt.split(/\r?\n/);
  const issues: ShapeIssue[] = [];

  // A wrapped prompt breaks mid-phrase, so each instruction is rejoined with
  // its continuation lines before being read. Matching line by line would miss
  // every instruction the formatter happened to wrap — which is most of them.
  const joined: { text: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)![0].length;
    let text = raw.trim();
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && lines[j].match(/^\s*/)![0].length > indent) {
      text += " " + lines[j].trim();
      j++;
    }
    joined.push({ text: text.replace(/\s+/g, " "), line: i + 1 });
  }

  // Which steps each Expanded Subprocess holds, from its own line:
  //   Expanded Subprocess "<name>" (standard loop) containing, in order: <type> "<a>", <type> "<b>", …
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const epMembers = new Map<string, { name: string; members: Set<string> }>();
  for (const { text } of joined) {
    const m = text.match(/Expanded Subprocess\s+"([^"]+)"[^"]*?containing,?\s*in order:\s*(.*)$/i);
    if (m) epMembers.set(norm(m[1]), { name: m[1], members: new Set([...m[2].matchAll(/"([^"]+)"/g)].map((x) => norm(x[1]))) });
  }

  let inMessages = false;
  for (const { text, line } of joined) {
    if (/^Message flows:/i.test(text)) { inMessages = true; continue; }
    if (/^Sequence flows:/i.test(text) || /^\d\.\s/.test(text)) inMessages = false;

    // (a) A boundary event mounted on something that is not an activity.
    const b = text.match(/boundary event on\s+"?([^"—]+?)"?\s*(?:—|-|,|$)/i);
    if (b && NOT_AN_ACTIVITY.test(b[1].trim())) {
      issues.push({
        line, kind: "boundary-on-non-activity",
        detail: `mounted on "${b[1].trim().slice(0, 60)}" — a boundary event can only be attached to a task or subprocess`,
      });
    }

    // (c) A boundary event on a step INSIDE an Expanded Subprocess whose exception path leads OUT of it (Paul, 2026-10-07: rule R8.45, the
    //     diagram check B41). An event on a child's rim sits inside the subprocess, so the path must stay inside; to leave, the event is
    //     mounted on the Expanded Subprocess itself. The destinations are every name quoted after "leading to" / "continues to".
    const bh = text.match(/boundary event on\s+(?:[A-Za-z-]+\s+){0,4}?"([^"]+)"/i);
    const lead = text.search(/\b(?:leading to|continues to)\b/i);
    if (bh && lead >= 0) {
      const owner = [...epMembers.values()].find((ep) => ep.members.has(norm(bh[1])));
      if (owner) {
        const outside = [...text.slice(lead).matchAll(/"([^"]+)"/g)].map((x) => x[1])
          .find((d) => !owner.members.has(norm(d)) && norm(d) !== norm(owner.name));
        if (outside) {
          issues.push({
            line, kind: "boundary-leaves-subprocess",
            detail: `mounted on "${bh[1]}", which is inside Expanded Subprocess "${owner.name}", but leads out of it to "${outside}" — mount the event on the Expanded Subprocess itself`,
          });
        }
      }
    }

    // (d) A boundary event whose path goes STRAIGHT to an End event — a "silent failure" (Paul, 2026-10-08: rule R8.47, the diagram check
    //     B56). A task sits between them so a person can act when the exception occurs.
    // (e) An End event on a boundary event's line that is not a TERMINATE End event (rule R8.48, check B57): the exception ends the
    //     whole process.
    //     These two are ADVICE, not "cannot be drawn": generation puts the task in and sets the Terminate itself (R8.47 / R8.48), so a
    //     prompt that omits them still draws. They are reported only when asked for (`advice`) — by the prompt skill and the AI Generate
    //     console, which want the prompt right at the source — and not in the repository's "undrawable" counts.
    if (advice && /boundary event on/i.test(text)) {
      // Straight = from the word that starts the path, the next thing named is an End event (no task, subprocess or gateway in between).
      const from = text.search(/\b(?:triggers|leading to|leads to|continues to|goes to|ends? (?:in|at|with))\b/i);
      const after = from >= 0 ? text.slice(from) : "";
      const endAt = after.search(/\bEnd event\b/i);
      const straight = endAt >= 0 && !/\b(?:task|subprocess|activity|gateway)\b/i.test(after.slice(0, endAt));
      if (straight) {
        issues.push({
          line, kind: "boundary-straight-to-end",
          detail: "leads straight to an End event — a silent failure. Put a task between them (the event triggers a User task, which then ends in the End event)",
        });
      }
      for (const m of text.matchAll(/(Terminate\s+)?End event\s+"([^"]+)"/gi)) {
        if (!m[1]) {
          issues.push({
            line, kind: "exception-end-not-terminate",
            detail: `the End event "${m[2].slice(0, 50)}" finishes an exception path — write it as Terminate End event "${m[2].slice(0, 50)}"`,
          });
        }
      }
    }

    // (b) A message flow between two LANES. A message flow must cross a POOL
    //     boundary; between lanes of one pool it is a sequence flow, and if an
    //     outside participant was meant, that participant needs a pool.
    if (inMessages) {
      const m = text.match(MESSAGE_ARROW);
      if (m && /\blane\b/i.test(m[1]) && /\blane\b/i.test(m[2])) {
        issues.push({
          line, kind: "message-within-pool",
          detail: `${m[1].trim().slice(0, 40)} → ${m[2].trim().slice(0, 40)} — both ends are lanes of one pool`,
        });
      }
    }
  }
  return issues;
}
