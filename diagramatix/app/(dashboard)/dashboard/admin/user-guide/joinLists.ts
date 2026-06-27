import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Heals split lists LIVE. Deleting an item out of a numbered list can leave two
 * adjacent <ol> nodes — and the second restarts at 1. After every change this
 * plugin merges any two adjacent same-type lists so numbering stays continuous
 * immediately (no wait for a save/markdown round-trip). Bullet lists too.
 */
const isList = (name: string) => name === "orderedList" || name === "bulletList";

// Walk from the document root (its direct children are where top-level lists
// live) and collect the boundary position between any two adjacent same-type
// lists, recursing into children for nested lists.
function collectJoinPositions(node: ProseMirrorNode, pos: number, out: number[]) {
  node.forEach((child, offset, index) => {
    const childPos = pos + 1 + offset; // absolute position of `child`'s start
    if (index > 0) {
      const before = node.child(index - 1);
      if (isList(child.type.name) && before.type === child.type) out.push(childPos);
    }
    if (child.childCount > 0) collectJoinPositions(child, childPos, out);
  });
}

export const JoinAdjacentLists = Extension.create({
  name: "joinAdjacentLists",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const positions: number[] = [];
          collectJoinPositions(newState.doc, -1, positions); // doc content starts at 0
          if (positions.length === 0) return null;
          const tr = newState.tr;
          let joined = false;
          // Descending so earlier joins don't shift later positions.
          for (const p of positions.sort((a, b) => b - a)) {
            if (canJoin(tr.doc, p)) { tr.join(p); joined = true; }
          }
          return joined ? tr : null;
        },
      }),
    ];
  },
});
