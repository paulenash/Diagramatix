"use client";
/**
 * Live cursors (Phase 2). Broadcasts our pointer position (in WORLD coordinates,
 * so it maps correctly regardless of each viewer's pan/zoom) and renders every
 * other editor's cursor. Rendered INSIDE the Canvas world <g>, so cursors pan/
 * zoom with the diagram; a 1/zoom counter-scale keeps them a constant on-screen
 * size. Mounted only when collaboration is enabled (inside a Liveblocks room).
 */
import { useEffect, useRef } from "react";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react";

export function CollabCursors({
  clientToWorld,
  zoom,
  broadcast = true,
}: {
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  zoom: number;
  broadcast?: boolean;
}) {
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();
  const toWorld = useRef(clientToWorld);
  toWorld.current = clientToWorld;

  useEffect(() => {
    // A Viewer session doesn't broadcast its cursor — it just watches. (Clears
    // any cursor it had so others don't see it stuck.)
    if (!broadcast) { updateMyPresence({ cursor: null }); return; }
    const onMove = (e: PointerEvent) => {
      const w = toWorld.current(e.clientX, e.clientY);
      updateMyPresence({ cursor: { x: Math.round(w.x), y: Math.round(w.y) } });
    };
    const onLeave = () => updateMyPresence({ cursor: null });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      updateMyPresence({ cursor: null });
    };
  }, [updateMyPresence, broadcast]);

  const inv = 1 / (zoom || 1);
  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        const c = presence.cursor;
        if (!c) return null;
        const color = info?.color ?? "#2563eb";
        const name = info?.name ?? "Editor";
        return (
          <g key={connectionId} transform={`translate(${c.x}, ${c.y}) scale(${inv})`} style={{ pointerEvents: "none" }}>
            <path d="M0 0 L0 17 L4.5 12.7 L7.5 19 L10 18 L7 12 L13 12 Z" fill={color} stroke="#fff" strokeWidth={1} />
            <g transform="translate(13, 13)">
              <rect x={0} y={0} width={name.length * 6.3 + 12} height={16} rx={8} fill={color} />
              <text x={6} y={11.5} fontSize={10} fill="#ffffff" fontWeight={600}>{name}</text>
            </g>
          </g>
        );
      })}
    </>
  );
}
