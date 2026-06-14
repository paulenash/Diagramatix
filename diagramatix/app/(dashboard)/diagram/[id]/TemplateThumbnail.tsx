"use client";

import { useEffect, useState } from "react";
import type { TemplateData, DiagramElement } from "@/app/lib/diagram/types";

// Module-level cache so re-opening the dropdown (or re-rendering a row)
// never refetches a template's geometry. `inflight` dedupes concurrent
// requests for the same id.
const cache = new Map<string, TemplateData | null>();
const inflight = new Map<string, Promise<TemplateData | null>>();

async function loadTemplateData(id: string): Promise<TemplateData | null> {
  if (cache.has(id)) return cache.get(id) ?? null;
  let p = inflight.get(id);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`/api/templates/${id}`);
        if (!res.ok) return null;
        const tmpl = await res.json();
        return (tmpl?.data as TemplateData) ?? null;
      } catch {
        return null;
      }
    })().then((d) => {
      cache.set(id, d);
      inflight.delete(id);
      return d;
    });
    inflight.set(id, p);
  }
  return p;
}

// A simple, recognisable silhouette per element type — enough to tell two
// templates apart at a glance, not a faithful render. Strokes use
// vectorEffect so they stay crisp regardless of how far the viewBox scales.
function ElementShape({ el }: { el: DiagramElement }) {
  const { x, y, width: w, height: h, type } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  switch (type) {
    case "gateway":
      return (
        <polygon
          points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
          fill="#fef9c3" stroke="#ca8a04" strokeWidth={1} vectorEffect="non-scaling-stroke"
        />
      );
    case "start-event":
      return <circle cx={cx} cy={cy} r={r} fill="#dcfce7" stroke="#16a34a" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
    case "end-event":
      return <circle cx={cx} cy={cy} r={r} fill="#fee2e2" stroke="#dc2626" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    case "intermediate-event":
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="#fff7ed" stroke="#ca8a04" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <circle cx={cx} cy={cy} r={Math.max(0, r - 2)} fill="none" stroke="#ca8a04" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      );
    case "data-object":
    case "data-store":
      return <rect x={x} y={y} width={w} height={h} rx={2} fill="#f3f4f6" stroke="#6b7280" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
    case "pool":
    case "lane":
    case "group":
      return <rect x={x} y={y} width={w} height={h} fill="none" stroke="#9ca3af" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
    case "task":
    case "subprocess":
    case "subprocess-expanded":
      return <rect x={x} y={y} width={w} height={h} rx={4} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
    default:
      return <rect x={x} y={y} width={w} height={h} rx={2} fill="#eef2ff" stroke="#818cf8" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
  }
}

/**
 * Small SVG preview of a template's shapes, shown to the left of each row
 * in the Templates dropdown to aid selection. Fetches the template geometry
 * lazily (only when the row mounts) and caches it at module scope.
 */
export function TemplateThumbnail({
  templateId,
  width = 64,
  height = 48,
}: {
  templateId: string;
  width?: number;
  height?: number;
}) {
  const [data, setData] = useState<TemplateData | null | undefined>(() =>
    cache.has(templateId) ? cache.get(templateId) : undefined,
  );

  useEffect(() => {
    let alive = true;
    if (cache.has(templateId)) {
      setData(cache.get(templateId));
      return;
    }
    void loadTemplateData(templateId).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [templateId]);

  // Frame everything — elements AND connector waypoints — so loops or
  // labels that spill past the element bounds aren't clipped.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (data) {
    for (const el of data.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    for (const c of data.connectors) {
      for (const wp of c.waypoints) {
        minX = Math.min(minX, wp.x);
        minY = Math.min(minY, wp.y);
        maxX = Math.max(maxX, wp.x);
        maxY = Math.max(maxY, wp.y);
      }
    }
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  const empty = !data || data.elements.length === 0 || !(bw > 0) || !(bh > 0);
  const pad = Math.max(bw, bh) * 0.06 + 2;

  return (
    <div
      className="shrink-0 rounded border border-gray-200 bg-white overflow-hidden flex items-center justify-center"
      style={{ width, height }}
    >
      {empty ? (
        <span className="text-[8px] text-gray-300">{data === undefined ? "" : "—"}</span>
      ) : (
        <svg
          width={width}
          height={height}
          viewBox={`${minX - pad} ${minY - pad} ${bw + pad * 2} ${bh + pad * 2}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {data!.connectors.map((c) => (
            <polyline
              key={c.id}
              points={c.waypoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none" stroke="#9ca3af" strokeWidth={1} vectorEffect="non-scaling-stroke"
            />
          ))}
          {data!.elements.map((el) => (
            <ElementShape key={el.id} el={el} />
          ))}
        </svg>
      )}
    </div>
  );
}
