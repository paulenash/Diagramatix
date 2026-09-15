/**
 * One spoken command, one undo.
 *
 * Every reducer helper in `useDiagram` pushes its own undo snapshot before it
 * mutates — right for a person clicking, wrong for a command that fans out into
 * five helpers ("add a task called X after Y" = add + label + connector + maybe
 * extend). "Undo that" then reverted the connector and left the task.
 *
 * This gate turns N pushes into ONE while a group is open: the first push inside
 * the group is admitted (it carries the state before anything changed) and every
 * later push in the same group is dropped. Nesting is counted, so a group opened
 * inside a group still ends exactly once. A group in which nothing pushes (an
 * "undo" command, an export) leaves no entry behind — the gate is lazy.
 *
 * Pure, so it is testable without React; `useDiagram` holds one in a ref.
 */
export interface HistoryGroupGate {
  /** Start a group, or nest into the open one. */
  begin(): void;
  /** End the innermost group; the outermost `end` resets the gate. */
  end(): void;
  /** Is a group open? */
  readonly open: boolean;
  /** Should THIS push go through? Always outside a group; inside, only the first. */
  admit(): boolean;
}

export function createHistoryGroupGate(): HistoryGroupGate {
  let depth = 0;
  let pushed = false;
  return {
    get open() { return depth > 0; },
    begin() { if (depth === 0) pushed = false; depth += 1; },
    end() { if (depth > 0) depth -= 1; if (depth === 0) pushed = false; },
    admit() {
      if (depth === 0) return true;
      if (pushed) return false;
      pushed = true;
      return true;
    },
  };
}
