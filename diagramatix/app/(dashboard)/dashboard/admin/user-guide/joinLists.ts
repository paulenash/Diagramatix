import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";

/**
 * Heals split lists. When you delete an item out of a numbered list, ProseMirror
 * can leave two adjacent <ol> nodes — and the second restarts at 1. This plugin
 * merges any two adjacent same-type lists after each change, so numbering stays
 * continuous (and bullet lists don't fragment either).
 */
const isList = (name: string) => name === "orderedList" || name === "bulletList";

export const JoinAdjacentLists = Extension.create({
  name: "joinAdjacentLists",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          // Collect boundary positions where a list follows a same-type list.
          const positions: number[] = [];
          newState.doc.descendants((node, pos) => {
            node.forEach((child, offset, index) => {
              if (index === 0) return;
              const before = node.child(index - 1);
              if (isList(child.type.name) && before.type === child.type) {
                positions.push(pos + 1 + offset); // boundary at the start of `child`
              }
            });
          });
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
