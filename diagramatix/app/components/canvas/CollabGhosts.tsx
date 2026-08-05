"use client";
/**
 * Co-authoring Approach A — LIVE PREVIEW (receiver half). Renders every OTHER
 * editor's in-progress element edits (from their presence.liveEdits) as dashed,
 * translucent, per-user-coloured ghosts, so you watch them move/rename/add in
 * real time. Only elements that DIFFER from your own local copy (or are new to
 * you) are drawn, so once you save + merge, the ghosts naturally disappear.
 * Rendered inside the Canvas world <g> so it pans/zooms with the diagram.
 */
import { useOthers } from "@liveblocks/react";
import type { DiagramElement } from "@/app/lib/diagram/types";

export function CollabGhosts({ localElements, zoom }: { localElements: DiagramElement[]; zoom: number }) {
  const others = useOthers();
  const localById = new Map(localElements.map((e) => [e.id, e]));
  const inv = 1 / (zoom || 1);

  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        const edits = presence.liveEdits;
        if (!edits || edits.length === 0) return null;
        const color = info?.color ?? "#2563eb";
        const name = info?.name ?? "Editor";
        return (
          <g key={`ghosts-${connectionId}`} style={{ pointerEvents: "none" }}>
            {edits.map((ed) => {
              const local = localById.get(ed.id);
              // Skip anything already identical to my copy — only show their changes.
              if (local && Math.round(local.x) === ed.x && Math.round(local.y) === ed.y && (local.label ?? "") === ed.label) return null;
              return (
                <g key={`${connectionId}-${ed.id}`} transform={`translate(${ed.x}, ${ed.y})`}>
                  <rect x={0} y={0} width={ed.w} height={ed.h} rx={4}
                    fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.75}
                    strokeWidth={1.5 * inv} strokeDasharray={`${6 * inv} ${3 * inv}`} />
                  {ed.label && (
                    <text x={ed.w / 2} y={ed.h / 2} fontSize={11 * inv} fill={color}
                      textAnchor="middle" dominantBaseline="middle" fontWeight={600} opacity={0.9}>
                      {ed.label}
                    </text>
                  )}
                  {/* tiny "who" tag on the top-left corner of the ghost */}
                  <g transform={`translate(0, ${-4 * inv}) scale(${inv})`}>
                    <rect x={0} y={-13} width={name.length * 5.6 + 10} height={13} rx={6} fill={color} />
                    <text x={5} y={-3} fontSize={9} fill="#ffffff" fontWeight={600}>{name}</text>
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}
