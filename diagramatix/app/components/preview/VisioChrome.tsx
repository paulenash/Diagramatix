"use client";

import { symbolGlyphSvg } from "@/app/lib/help/symbolGlyph";

/**
 * Purely-cosmetic "Visio window" for the file-preview pop-up (`kind:"vsdx"`).
 * Nothing here is interactive — it exists so a Diagramatix diagram can be shown
 * *as if* it were open in Microsoft Visio during a screencast, without any real
 * .vsdx parsing. A Visio-blue ribbon runs across the top, a Shapes stencil sits
 * on the left (our own BPMN glyphs as "masters"), and the diagram's own SVG is
 * the drawing surface on a faint Visio grid.
 */

const RIBBON_TABS = ["File", "Home", "Insert", "Design", "Data", "Process", "Review", "View", "Help"];

// Stencil "masters" — our BPMN glyphs relabelled with Visio-ish master names.
const MASTERS: { type: string; name: string }[] = [
  { type: "start-event", name: "Start" },
  { type: "task", name: "Task" },
  { type: "subprocess", name: "Sub-process" },
  { type: "gateway-exclusive", name: "Exclusive gateway" },
  { type: "gateway-parallel", name: "Parallel gateway" },
  { type: "gateway-inclusive", name: "Inclusive gateway" },
  { type: "intermediate-event", name: "Intermediate" },
  { type: "end-event", name: "End" },
  { type: "data-object", name: "Data object" },
  { type: "data-store", name: "Data store" },
  { type: "pool", name: "Pool" },
  { type: "lane", name: "Lane" },
];

export function VisioChrome({ svg, title }: { svg: string; title: string }) {
  return (
    <div className="rounded border border-gray-300 overflow-hidden bg-white select-none">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2b579a] text-white text-[11px]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-white/90 text-[#2b579a] font-bold text-[10px]">V</span>
          <span className="font-medium truncate">{title} — Visio</span>
        </div>
        <div className="flex items-center gap-2 text-white/80">
          <span className="leading-none">—</span>
          <span className="leading-none">▢</span>
          <span className="leading-none">✕</span>
        </div>
      </div>

      {/* Ribbon tabs */}
      <div className="flex items-stretch bg-[#f3f2f1] border-b border-gray-300 text-[11px]">
        {RIBBON_TABS.map((t, i) => (
          <div key={t}
            className={`px-3 py-1.5 ${i === 1 ? "bg-white text-[#2b579a] font-semibold border-t-2 border-[#2b579a]" : "text-gray-600"}`}>
            {t}
          </div>
        ))}
      </div>

      {/* Ribbon tool row (cosmetic) */}
      <div className="flex items-center gap-4 px-3 py-2 bg-white border-b border-gray-200 text-[10px] text-gray-500">
        <RibbonGroup label="Clipboard" items={["✂", "📋", "🖌"]} />
        <RibbonGroup label="Font" items={["B", "I", "U", "A"]} />
        <RibbonGroup label="Shape" items={["▭", "◇", "◯", "↳"]} />
        <RibbonGroup label="Tools" items={["🖱", "🔗", "🅰", "🔍"]} />
      </div>

      {/* Body: stencil + drawing surface */}
      <div className="flex" style={{ height: "56vh" }}>
        {/* Shapes stencil */}
        <div className="w-44 shrink-0 border-r border-gray-200 bg-[#faf9f8] overflow-y-auto">
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-[#f3f2f1]">
            Shapes
          </div>
          <div className="px-2 py-1 text-[10px] text-[#2b579a] border-b border-gray-100">BPMN Basic Shapes</div>
          <div className="grid grid-cols-2 gap-1 p-2">
            {MASTERS.map((m) => (
              <div key={m.type} className="flex flex-col items-center gap-1 p-1.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200">
                <span className="[&_svg]:w-8 [&_svg]:h-6"
                  dangerouslySetInnerHTML={{ __html: symbolGlyphSvg(m.type) }} />
                <span className="text-[9px] text-gray-600 text-center leading-tight">{m.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Drawing surface — the real diagram SVG on a Visio grid */}
        <div className="flex-1 overflow-auto p-6"
          style={{
            backgroundColor: "#ffffff",
            backgroundImage:
              "linear-gradient(#e5edf7 1px, transparent 1px), linear-gradient(90deg, #e5edf7 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}>
          <div className="inline-block bg-white shadow-md ring-1 ring-gray-200 p-4 [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#2b579a] text-white/90 text-[10px]">
        <span>Page 1 of 1</span>
        <span>BPMN · Diagramatix</span>
      </div>
    </div>
  );
}

function RibbonGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1.5 text-[13px] text-gray-600">
        {items.map((it, i) => <span key={i} className="leading-none">{it}</span>)}
      </div>
      <div className="mt-0.5 text-[9px] text-gray-400">{label}</div>
    </div>
  );
}
