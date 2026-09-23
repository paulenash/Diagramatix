"use client";

/**
 * "Add template" — the whole library, numbered, chosen by voice.
 *
 * Paul, 2026-09-24: "A large pop-up window appears with all of the templates in
 * their groups, divided by built-in and user of course … displayed with large
 * icons of the actual template and our familiar green numbers marking each one,
 * so that all the user has to do is say seven or nine and that template is
 * provisionally added."
 *
 * The green is the badge green from the canvas (#16a34a), because the number in
 * this window means what a number on a badge means: say it. The pictures are
 * the templates' own stored previews, drawn large — a template is recognised by
 * its shape long before its name is read.
 *
 * The window shows WHICH ONE IS ON THE DIAGRAM right now (the provisional
 * pick): its card is ringed and says so, since the canvas behind is mostly
 * covered and the user needs to know what they are confirming.
 *
 * The mouse works too. A voice feature that cannot be clicked is a feature with
 * one way to fail.
 */
import { TemplateThumbnail } from "@/app/(dashboard)/diagram/[id]/TemplateThumbnail";
import type { TemplateCard, TemplateSection } from "@/app/lib/assist/templatePick";

const BADGE_GREEN = "#16a34a";

interface Props {
  sections: TemplateSection[];
  /** The template currently sitting on the diagram, waiting to be kept. */
  provisionalId: string | null;
  onPick: (card: TemplateCard) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Shown when the diagram already has a white-box pool and starters are hidden. */
  hiddenInitialCount?: number;
}

export function TemplatePickerWindow({
  sections, provisionalId, onPick, onConfirm, onCancel, hiddenInitialCount = 0,
}: Props) {
  const total = sections.reduce((n, s) => n + s.cards.length, 0);
  const bySource = (source: "builtin" | "user") => sections.filter((s) => s.source === source && s.cards.length);
  const builtIn = bySource("builtin");
  const mine = bySource("user");

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add a template</h3>
            <p className="text-xs text-gray-500">
              Say a number — {total} to choose from. Then “yes” to keep it, or another number to swap.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {provisionalId && (
              <button onClick={onConfirm}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-green-600 hover:bg-green-700">
                Keep it
              </button>
            )}
            <button onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[20rem]">
          {total === 0 && (
            <p className="text-xs text-gray-500 py-10 text-center">No templates to offer for this diagram.</p>
          )}
          {[["Built-in templates", builtIn], ["Your templates", mine]].map(([heading, list]) => {
            const secs = list as TemplateSection[];
            if (!secs.length) return null;
            return (
              <section key={heading as string} className="mb-5">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">{heading as string}</h4>
                {secs.map((s) => (
                  <div key={`${s.source}-${s.group ?? "_"}`} className="mb-4">
                    {s.group && <p className="text-[11px] font-medium text-gray-500 mb-1.5">{s.group}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {s.cards.map((card) => {
                        const showing = card.id === provisionalId;
                        return (
                          <button
                            key={card.id}
                            onClick={() => onPick(card)}
                            title={card.description ?? card.name}
                            className={`relative text-left border rounded-lg p-2 hover:bg-gray-50 ${
                              showing ? "border-green-600 ring-2 ring-green-500/40 bg-green-50/40" : "border-gray-200"
                            }`}
                          >
                            <span
                              className="absolute -top-2 -left-2 flex items-center justify-center rounded-full text-white text-xs font-semibold"
                              style={{ background: BADGE_GREEN, width: 26, height: 26, border: "2px solid #fff" }}
                            >
                              {card.n}
                            </span>
                            <div className="flex items-center justify-center h-[104px] overflow-hidden">
                              <TemplateThumbnail templateId={card.id} svg={card.thumbnailSvg} width={190} height={100} />
                            </div>
                            <p className="mt-1.5 text-xs font-medium text-gray-800 truncate">{card.name}</p>
                            {showing
                              ? <p className="text-[11px] text-green-700">on the diagram — say “yes” to keep</p>
                              : card.description
                                ? <p className="text-[11px] text-gray-500 line-clamp-2">{card.description}</p>
                                : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-500">
            Say a number · “yes” to keep · “cancel” to stop
          </span>
          {hiddenInitialCount > 0 && (
            <span className="text-[11px] text-gray-400">
              {hiddenInitialCount} starter template{hiddenInitialCount === 1 ? "" : "s"} hidden — this diagram already has a pool
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
