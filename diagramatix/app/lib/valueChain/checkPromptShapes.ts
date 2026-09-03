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
  kind: "boundary-on-non-activity" | "message-within-pool";
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

export function checkPromptShapes(prompt: string): ShapeIssue[] {
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
