"use client";

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/**
 * SVG overlay (rendered inside MobileDiagramView's transformed layer) that draws
 * tappable pins for the note-like elements that read badly as tiny shapes on a
 * phone: **review comments** (💬 pink) and **text annotations** (📝 amber). Each
 * pin sits at its element and tethers to whatever it's linked to; tapping opens
 * its text (`onOpen`). Coordinates are diagram-space + the thumbnail transform.
 */

const PIN_R = 13;

function centre(el: DiagramElement, tx: number, ty: number) {
  return { x: el.x + el.width / 2 + tx, y: el.y + el.height / 2 + ty };
}

function Pin({
  el, data, tx, ty, linkTypes, fill, stroke, textColor, glyph, disabled, onOpen,
}: {
  el: DiagramElement; data: DiagramData; tx: number; ty: number;
  linkTypes: string[]; fill: string; stroke: string; textColor: string; glyph: string;
  disabled: boolean; onOpen: (el: DiagramElement) => void;
}) {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const link = (data.connectors ?? []).find(
    (c) => linkTypes.includes(c.type) && (c.sourceId === el.id || c.targetId === el.id),
  );
  const targetId = link ? (link.sourceId === el.id ? link.targetId : link.sourceId) : undefined;
  const target = targetId ? byId.get(targetId) : undefined;
  const pin = { x: el.x + tx + PIN_R, y: el.y + ty + PIN_R };
  const tgt = target ? centre(target, tx, ty) : null;
  return (
    <g>
      {tgt && <line x1={pin.x} y1={pin.y} x2={tgt.x} y2={tgt.y} stroke={stroke} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.8} />}
      <g style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); if (!disabled) onOpen(el); }}>
        <circle cx={pin.x} cy={pin.y} r={PIN_R} fill={fill} stroke={stroke} strokeWidth={1.5} />
        <text x={pin.x} y={pin.y + 5} textAnchor="middle" fontSize={15} fill={textColor}>{glyph}</text>
      </g>
    </g>
  );
}

export function MobileReviewLayer({
  data,
  comments,
  annotations = [],
  tx,
  ty,
  onOpen,
  disabled = false,
}: {
  data: DiagramData;
  comments: DiagramElement[];
  annotations?: DiagramElement[];
  tx: number;
  ty: number;
  onOpen: (el: DiagramElement) => void;
  /** While picking a target element, don't let pins intercept the tap. */
  disabled?: boolean;
}) {
  const showComments = data.showReviewComments !== false;
  return (
    <>
      {showComments && comments.map((c) => (
        <Pin key={c.id} el={c} data={data} tx={tx} ty={ty} linkTypes={["review-comment-link"]}
          fill="#fbcfe8" stroke="#db2777" textColor="#9d174d" glyph="💬" disabled={disabled} onOpen={onOpen} />
      ))}
      {annotations.map((a) => (
        <Pin key={a.id} el={a} data={data} tx={tx} ty={ty} linkTypes={["association", "associationBPMN", "text-annotation"]}
          fill="#fef3c7" stroke="#d97706" textColor="#92400e" glyph="📝" disabled={disabled} onOpen={onOpen} />
      ))}
    </>
  );
}
