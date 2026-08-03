"use client";
/**
 * Wraps the editor in a Liveblocks room for real-time co-authoring (Phase 2).
 * When collaboration is disabled/unconfigured it renders children unchanged, so
 * the editor keeps working on Phase 1 (polled presence). The browser
 * authenticates via /api/collab/token (the server holds the secret).
 */
import type { ReactNode } from "react";
import { LiveblocksProvider, RoomProvider } from "@liveblocks/react";
import "@/app/lib/collab/liveblocks"; // global Presence/UserMeta types

export function CollabRoom({
  diagramId,
  enabled,
  children,
}: {
  diagramId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <LiveblocksProvider authEndpoint="/api/collab/token">
      <RoomProvider id={`diagram:${diagramId}`} initialPresence={{ cursor: null }}>
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  );
}
