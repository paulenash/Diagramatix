"use client";

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/**
 * SVG overlay (rendered inside MobileDiagramView's transformed layer) that draws
 * each review-comment as a tappable pink pin + a tether to its linked element.
 * Coordinates are diagram-space + the thumbnail transform (tx, ty) so pins line up
 * with the backdrop. Tapping a pin opens it (read / edit sheet) via `onOpen`.
 */

const PIN_R = 13;

function centre(el: DiagramElement, tx: number, ty: number) {
  return { x: el.x + el.width / 2 + tx, y: el.y + el.height / 2 + ty };
}

export function MobileReviewLayer({
  data,
  comments,
  tx,
  ty,
  onOpen,
  disabled = false,
}: {
  data: DiagramData;
  comments: DiagramElement[];
  tx: number;
  ty: number;
  onOpen: (comment: DiagramElement) => void;
  /** While picking a target element, don't let pins intercept the tap. */
  disabled?: boolean;
}) {
  if (data.showReviewComments === false) return null;
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const links = (data.connectors ?? []).filter((c) => c.type === "review-comment-link");

  return (
    <>
      {comments.map((c) => {
        // Find the tethered target element (the other end of a review-comment-link).
        const link = links.find((l) => l.sourceId === c.id || l.targetId === c.id);
        const targetId = link ? (link.sourceId === c.id ? link.targetId : link.sourceId) : undefined;
        const target = targetId ? byId.get(targetId) : undefined;
        const pin = { x: c.x + tx + PIN_R, y: c.y + ty + PIN_R };
        const tgt = target ? centre(target, tx, ty) : null;
        return (
          <g key={c.id}>
            {tgt && (
              <line x1={pin.x} y1={pin.y} x2={tgt.x} y2={tgt.y}
                stroke="#db2777" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.8} />
            )}
            {/* Tappable pin. pointer-events:auto so it receives taps through the
                (otherwise pass-through) overlay; stopPropagation avoids the
                container's tap handlers. */}
            <g style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); if (!disabled) onOpen(c); }}>
              <circle cx={pin.x} cy={pin.y} r={PIN_R} fill="#fbcfe8" stroke="#db2777" strokeWidth={1.5} />
              <text x={pin.x} y={pin.y + 5} textAnchor="middle" fontSize={15} fill="#9d174d">💬</text>
            </g>
          </g>
        );
      })}
    </>
  );
}
