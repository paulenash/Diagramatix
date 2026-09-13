"use client";

/**
 * Items 6, 7 and 8 — where the description can come FROM, other than typing it.
 *
 * Item 7 splits the one "Attach" button in two. It was always two things behind
 * one label: a document is read as text and a picture of a diagram is
 * reverse-engineered by vision, and only the second has a "Reproduce original
 * layout" option. One button with an eleven-extension accept list hid that.
 * Both still run through the SAME handler, so nothing about how a file is read
 * depends on which button opened the dialog — the accept list narrows the
 * chooser, it does not change the parsing.
 */
import { useRef } from "react";
import { AiPanel, AiButton, type AiTones } from "./AiConsoleChrome";
import { AudioToProcessButton } from "@/app/components/AudioToProcessButton";

const DOC_ACCEPT = ".pdf,.txt,.md,.csv,.rtf,.doc,.docx";
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,image/*";

export interface Attachment {
  name: string;
  type: "pdf" | "text" | "image";
}

export function SourcesPanel({
  tones, busy, diagramType, onFile,
  attachment, onPreviewAttachment, onRemoveAttachment,
  showPreserveLayout, preserveLayout, onPreserveLayoutChange,
  onAudioPhaseChange, onAudioError, onAudioFeedback, onTranscript,
  clarifyCount, onOpenClarify,
}: {
  tones: AiTones;
  busy: boolean;
  diagramType: string;
  onFile: (file: File) => void;
  attachment: Attachment | null;
  onPreviewAttachment: () => void;
  onRemoveAttachment: () => void;
  showPreserveLayout: boolean;
  preserveLayout: boolean;
  onPreserveLayoutChange: (next: boolean) => void;
  onAudioPhaseChange: (phase: null | "transcribing" | "reading" | "tidying") => void;
  onAudioError: (message: string) => void;
  onAudioFeedback: (questions: string[]) => void;
  onTranscript: (text: string) => void;
  clarifyCount: number;
  onOpenClarify: () => void;
}) {
  const docRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => () => ref.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = "";
  };

  return (
    <AiPanel title="Sources" tones={tones} hint="document · image · recording · transcript">
      <input ref={docRef} type="file" className="hidden" accept={DOC_ACCEPT} onChange={onChange} />
      <input ref={imgRef} type="file" className="hidden" accept={IMAGE_ACCEPT} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-2">
        <AiButton tones={tones} onClick={pick(docRef)} disabled={busy}
          title="Load a document to generate from (PDF, TXT, MD, CSV, RTF, DOC, DOCX)">
          <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 0 1-7 0V3z" />
          </svg>
          Load Attachment
        </AiButton>
        <AiButton tones={tones} onClick={pick(imgRef)} disabled={busy}
          title="Load an image of a BPMN diagram or flowchart (PNG, JPEG, WebP, GIF) and reverse-engineer it">
          <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M14.5 3h-13a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5zM2 12V4h12v5.6l-2.6-2.2a.5.5 0 0 0-.65.01L7.5 10.2 5.9 8.9a.5.5 0 0 0-.63 0L2 11.4V12z" />
            <circle cx="5.5" cy="6.5" r="1.2" />
          </svg>
          Load Image
        </AiButton>

        {/* Item 8 — Record kept as-is; item 6 — the upload reads "Transcript",
            which is what a .vtt actually is. */}
        <AudioToProcessButton
          disabled={busy}
          diagramType={diagramType}
          uploadIdleLabel="Transcript"
          buttonClassName="border-white/25 hover:bg-white/10"
          checkboxClassName="text-white/55"
          onPhaseChange={onAudioPhaseChange}
          onError={onAudioError}
          onFeedback={onAudioFeedback}
          onTranscript={onTranscript}
        />

        {clarifyCount > 0 && (
          <AiButton tones={tones} onClick={onOpenClarify} variant="outline"
            style={{ color: "#fcd34d", borderColor: "rgba(252,211,77,0.5)" }}
            title="Answer the AI Tidy questions raised from your transcript and regenerate the plan">
            AI Tidy Questions ({clarifyCount})
          </AiButton>
        )}
      </div>

      {attachment && (
        <div className="flex items-center gap-2 mt-2 rounded border px-2 py-1" style={{ borderColor: tones.line }}>
          <span className="text-[10px] uppercase tracking-wide text-white/35 shrink-0">{attachment.type}</span>
          <button onClick={onPreviewAttachment} className="flex-1 min-w-0 text-left text-xs truncate hover:underline"
            style={{ color: tones.bright }} title="Preview attachment">
            {attachment.name}
          </button>
          <button onClick={onPreviewAttachment} className="text-[11px] text-white/45 hover:text-white shrink-0"
            title="Preview attachment">Preview</button>
          <button onClick={onRemoveAttachment} className="text-white/35 hover:text-red-400 text-sm shrink-0"
            title="Remove attachment" aria-label="Remove attachment">&times;</button>
        </div>
      )}

      {showPreserveLayout && (
        <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none"
          title="Rebuild the diagram at the positions drawn in the image (pools any size/placement, rectilinear messages) instead of Diagramatix's auto-layout.">
          <input type="checkbox" className="cursor-pointer" checked={preserveLayout}
            onChange={(e) => onPreserveLayoutChange(e.target.checked)} />
          <span className="text-[11px] text-white/70">Reproduce original layout</span>
        </label>
      )}
    </AiPanel>
  );
}
