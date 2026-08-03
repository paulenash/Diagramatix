/**
 * Liveblocks typing + enable flag for Phase 2 real-time co-authoring (cursors).
 * Collaboration is OFF unless NEXT_PUBLIC_LIVEBLOCKS_ENABLED === "true" AND the
 * server has LIVEBLOCKS_SECRET_KEY (the auth route 503s otherwise). When off the
 * app runs Phase 1 (polled presence) unchanged.
 */

// Global augmentation so Liveblocks hooks are typed across the app.
declare global {
  interface Liveblocks {
    Presence: { cursor: { x: number; y: number } | null };
    UserMeta: { id: string; info: { name: string; color: string } };
  }
}

export const LIVEBLOCKS_ENABLED = process.env.NEXT_PUBLIC_LIVEBLOCKS_ENABLED === "true";
