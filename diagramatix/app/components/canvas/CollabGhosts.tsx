"use client";
/**
 * Co-authoring Approach A — LIVE PREVIEW (receiver half). Renders every OTHER
 * editor's in-progress element + connector edits (from their presence) as
 * dashed, translucent, per-user-coloured ghosts, so you watch them move/rename/
 * add in real time. Only items that DIFFER from your own local copy (or are new
 * to you) are drawn, so once you save + merge, the ghosts disappear. Rendered
 * inside the Canvas world <g> so it pans/zooms with the diagram.
 *
 * Ghost elements render with the label WRAPPED to the element width (#2), so a
 * long name previews the way it will actually look to its author.
 */
import { useOthers } from "@liveblocks/react";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";
import { wrapText } from "@/app/lib/diagram/textMetrics";

const LABEL_PAD = 10;
const LINE_H = 13;

export function CollabGhosts({
  localElements,
  localConnectors,
  zoom,
}: {
  localElements: DiagramElement[];
  localConnectors: Connector[];
  zoom: number;
}) {
  const others = useOthers();
  const localById = new Map(localElements.map((e) => [e.id, e]));
  const localConnById = new Map(localConnectors.map((c) => [c.id, c]));
  const inv = 1 / (zoom || 1);

  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        const edits = presence.liveEdits;
        const conns = presence.liveConns;
        if ((!edits || edits.length === 0) && (!conns || conns.length === 0)) return null;
        const color = info?.color ?? "#2563eb";
        const name = info?.name ?? "Editor";
        return (
          <g key={`ghosts-${connectionId}`} style={{ pointerEvents: "none" }}>
            {/* Ghost CONNECTORS (#3) — dashed polyline through their waypoints */}
            {(conns ?? []).map((c) => {
              const local = localConnById.get(c.id);
              const localSig = local ? `${(local.waypoints ?? []).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";")}|${local.label ?? ""}|${local.labelOffsetX ?? ""},${local.labelOffsetY ?? ""}` : "";
              const remoteSig = `${c.pts.map((p) => `${p.x},${p.y}`).join(";")}|${c.label}|${c.lox ?? ""},${c.loy ?? ""}`;
              if (local && localSig === remoteSig) return null;   // unchanged for me
              if (c.pts.length < 2) return null;
              const d = c.pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
              const mid = c.pts[Math.floor(c.pts.length / 2)];
              // Label sits at the connector midpoint + its (moved) offset (#label-move).
              const lx = mid.x + (c.lox ?? 0);
              const ly = mid.y + (c.loy ?? 0);
              return (
                <g key={`${connectionId}-c-${c.id}`}>
                  <path d={d} fill="none" stroke={color} strokeOpacity={0.8} strokeWidth={1.6 * inv} strokeDasharray={`${6 * inv} ${3 * inv}`} />
                  {c.label && (
                    <>
                      {(c.lox || c.loy) && (
                        <line x1={mid.x} y1={mid.y} x2={lx} y2={ly} stroke={color} strokeOpacity={0.4} strokeWidth={0.8 * inv} strokeDasharray={`${2 * inv} ${2 * inv}`} />
                      )}
                      <g transform={`translate(${lx}, ${ly}) scale(${inv})`}>
                        <rect x={-(c.label.length * 3.2 + 5)} y={-8} width={c.label.length * 6.4 + 10} height={15} rx={4} fill="#ffffff" stroke={color} strokeOpacity={0.5} />
                        <text x={0} y={3} fontSize={10} fill={color} textAnchor="middle" fontWeight={600}>{c.label}</text>
                      </g>
                    </>
                  )}
                </g>
              );
            })}

            {/* Ghost ELEMENTS — dashed box with the WRAPPED label (#2) */}
            {(edits ?? []).map((ed) => {
              const local = localById.get(ed.id);
              if (local && Math.round(local.x) === ed.x && Math.round(local.y) === ed.y && (local.label ?? "") === ed.label) return null;
              const lines = ed.label ? wrapText(ed.label, ed.w - LABEL_PAD * 2, 12) : [];
              const blockH = lines.length * LINE_H;
              const startY = ed.h / 2 - blockH / 2 + LINE_H * 0.72;
              return (
                <g key={`${connectionId}-e-${ed.id}`} transform={`translate(${ed.x}, ${ed.y})`}>
                  <rect x={0} y={0} width={ed.w} height={ed.h} rx={4}
                    fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.75}
                    strokeWidth={1.5 * inv} strokeDasharray={`${6 * inv} ${3 * inv}`} />
                  {lines.map((line, i) => (
                    <text key={i} x={ed.w / 2} y={startY + i * LINE_H} fontSize={12} fill={color}
                      textAnchor="middle" fontWeight={600} opacity={0.9}>{line}</text>
                  ))}
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
