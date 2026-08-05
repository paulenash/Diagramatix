/**
 * Liveblocks typing for Phase 2 real-time co-authoring (cursors).
 *
 * Activation is server-driven: the diagram page passes `collabRealtime` = true
 * only when LIVEBLOCKS_SECRET_KEY is set (see page.tsx / the /api/collab/token
 * route). No build-time flag — enabling in prod is a single runtime env var, no
 * rebuild. When off the editor runs Phase 1 (polled presence) unchanged.
 *
 * Side-effect import this file (or import a symbol from it) anywhere it's needed
 * so the global augmentation below is in the compilation graph.
 */

/** One element the user is currently editing, broadcast so others see it live
 *  (Approach A: live preview over presence; the authoritative merge is still on
 *  save). Kept compact — id, position, size, label, type. */
export type LiveEditEl = { id: string; x: number; y: number; w: number; h: number; label: string; t: string };
/** One connector the user is currently editing, broadcast for the ghost preview. */
export type LiveEditConn = { id: string; pts: Array<{ x: number; y: number }>; label: string; t: string };

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      // Elements this user has changed vs the loaded diagram (their in-progress
      // edits), rendered as ghosts on everyone else's canvas. Null when idle.
      liveEdits?: LiveEditEl[] | null;
      // Connectors the user has changed (added / rerouted / relabelled), ghosted too.
      liveConns?: LiveEditConn[] | null;
    };
    UserMeta: { id: string; info: { name: string; color: string } };
  }
}

export {};
