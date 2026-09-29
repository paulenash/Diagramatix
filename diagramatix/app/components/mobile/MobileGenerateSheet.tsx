"use client";

/**
 * The phone's Generate sheet (2026-09-28, mobile voice stage 1): describe a
 * process by voice or by typing — or start from a saved prompt — optionally
 * Tidy it and answer its questions, then Generate. The words live in the
 * screen's draft, so closing the sheet or a failed run never loses them.
 *
 * Dictation is PROSE (capitals and full stops), not the command mode Voice
 * Assist uses. One microphone at a time — the description, or one answer — run
 * by app/lib/mobile/micController.ts, which also keeps the phrase still on
 * screen when Stop, Tidy or Generate is tapped.
 *
 * Stage 2: a PHOTO of a whiteboard or sketch instead of (or as well as) the
 * words. The photo alone is enough to Generate; words said or typed with it
 * are CORRECTIONS, and they win over the photo. While a photo is attached,
 * Tidy and saved prompts are put away — they describe a process from scratch.
 */
import { useEffect, useRef, useState } from "react";
import { startDictation } from "@/app/lib/dictation";
import {
  addSpokenTo, withAnswers, type GenerateDraft, type SavedPromptPick, type SpokenTarget,
} from "@/app/lib/mobile/generateDraft";
import { createMicController } from "@/app/lib/mobile/micController";
import { draftStorageKey, photoFromFile } from "@/app/lib/mobile/pickPhoto";
import { draftWordsForStorage } from "@/app/lib/mobile/generateDraft";
import { isWhiteboardPhotoPrompt, photoNoteParts } from "@/app/lib/ai/promptPreambles";
import { sourceImageUrl } from "@/app/lib/ai/sourceImage";
import { MicTest } from "./MicTest";
import { MobilePhotoViewer } from "./MobilePhotoViewer";

export function MobileGenerateSheet({
  diagramId, draft, setDraft, onGenerate, onClose, starting, error,
}: {
  /** The diagram — where a restored photo is shown from. */
  diagramId: string;
  draft: GenerateDraft;
  setDraft: (update: (d: GenerateDraft) => GenerateDraft) => void;
  /** Called with the finished draft (it may hold words the last render has not shown yet). */
  onGenerate: (finished: GenerateDraft) => void;
  onClose: () => void;
  /** The start request is in flight. */
  starting: boolean;
  /** Why the last start was refused, in the user's terms. */
  error: string | null;
}) {
  const [mic, setMic] = useState<{ target: SpokenTarget; ready: boolean } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const photoUrl = usePhotoUrl(draft.photo, diagramId);
  const [interim, setInterim] = useState("");
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [showMicTest, setShowMicTest] = useState(false);

  // The latest draft and setter, for callbacks that outlive a render.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const setDraftRef = useRef(setDraft);
  setDraftRef.current = setDraft;
  const mountedRef = useRef(true);

  const micRef = useRef<ReturnType<typeof createMicController<SpokenTarget>> | null>(null);
  if (!micRef.current) {
    micRef.current = createMicController<SpokenTarget>(startDictation, {
      onText: (target, text) => setDraftRef.current((d) => addSpokenTo(d, target, text)),
      onInterim: (text) => setInterim(text),
      onState: (s) => setMic(s),
      onMessage: (m) => setMicMsg(m),
    });
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; micRef.current?.dispose(); };
  }, []);

  /** Stop the mic and return the draft with the phrase that was still on screen. */
  function stopKeepingWords(): GenerateDraft {
    const kept = micRef.current?.stop();
    if (!kept) return draftRef.current;
    const next = addSpokenTo(draftRef.current, kept.target, kept.tail);
    setDraft(() => next);
    return next;
  }

  const [saved, setSaved] = useState<SavedPromptPick[] | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [savedErr, setSavedErr] = useState<string | null>(null);

  const [tidying, setTidying] = useState(false);
  const [tidyMsg, setTidyMsg] = useState<string | null>(null);
  const [beforeTidy, setBeforeTidy] = useState<GenerateDraft | null>(null);

  async function openSaved() {
    setShowSaved((v) => !v);
    if (saved !== null) return;
    try {
      const res = await fetch("/api/prompts?diagramType=bpmn", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const rows = (await res.json()) as { id: string; name: string; text: string }[];
      if (mountedRef.current) setSaved(rows.map((r) => ({ id: r.id, name: r.name, text: r.text })));
    } catch {
      if (!mountedRef.current) return;
      setSavedErr("Your saved prompts couldn't be loaded.");
      setSaved([]);
    }
  }

  function pickSaved(p: SavedPromptPick) {
    micRef.current?.stop();
    if (isWhiteboardPhotoPrompt(p.text)) {
      // Written for a photo that is not here: keep its corrections, ask for the photo.
      setDraft(() => ({ prompt: photoNoteParts(p.text)?.words ?? "", dictated: false, selected: null, questions: [], photo: null }));
      setPhotoMsg("That prompt was written for a whiteboard photo — take or choose the photo, then generate.");
      setShowSaved(false);
      setTidyMsg(null);
      setBeforeTidy(null);
      return;
    }
    setDraft(() => ({ prompt: p.text, dictated: false, selected: p, questions: [], photo: null }));
    setShowSaved(false);
    setTidyMsg(null);
    setBeforeTidy(null);
  }

  async function tidy() {
    if (tidying) return;
    const start = stopKeepingWords();
    // Answers already given go in, so a second Tidy folds them into the
    // description rather than asking the same questions again.
    const text = withAnswers(start);
    if (!text) return;
    setTidying(true);
    setTidyMsg(null);
    try {
      const res = await fetch("/api/ai/audio/refine-transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, diagramType: "bpmn" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) { setTidyMsg((j as { error?: string }).error ?? "Tidy isn't available right now."); return; }
      // Input is frozen while Tidy runs; this only guards a change that got in anyway.
      if (draftRef.current.prompt !== start.prompt || draftRef.current.questions !== start.questions) {
        setTidyMsg("Your description changed while it was being tidied — tap Tidy again.");
        return;
      }
      const description = typeof j.description === "string" && j.description.trim() ? j.description.trim() : text;
      const questions: string[] = Array.isArray(j.openQuestions)
        ? j.openQuestions.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
        : [];
      if (description === text && questions.length === 0) { setTidyMsg("Tidy had nothing to change."); return; }
      setBeforeTidy(start);
      setDraft((d) => ({ ...d, prompt: description, questions: questions.map((q) => ({ q, a: "" })) }));
      setTidyMsg(questions.length
        ? `Tidied. ${questions.length} question${questions.length === 1 ? "" : "s"} below — answer any you can, by voice or typing.`
        : "Tidied.");
    } catch {
      if (mountedRef.current) setTidyMsg("Couldn't reach Diagramatix — check your connection.");
    } finally {
      if (mountedRef.current) setTidying(false);
    }
  }

  function undoTidy() {
    if (!beforeTidy) return;
    micRef.current?.stop();
    setDraft(() => beforeTidy);
    setBeforeTidy(null);
    setTidyMsg(null);
  }

  /** The camera or the photo picker is about to take the screen: keep the words (the page may be reloaded meanwhile). */
  function beforePicker() {
    const d = stopKeepingWords();
    try { sessionStorage.setItem(draftStorageKey(diagramId), draftWordsForStorage(d)); } catch { /* private mode: the words stay in memory */ }
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file again must still fire
    if (!file) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    const r = await photoFromFile(file);
    if (!mountedRef.current) return;
    setPhotoBusy(false);
    if (!r.ok) { setPhotoMsg(r.message); return; }
    // A photo and a saved prompt are one or the other; Tidy's questions were about the words alone.
    setDraft((d) => ({ ...d, photo: r.photo, selected: null }));
    setTidyMsg(null);
    setBeforeTidy(null);
  }

  function removePhoto() {
    setDraft((d) => ({ ...d, photo: null }));
    setPhotoMsg(null);
  }

  function generate() {
    onGenerate(stopKeepingWords());
  }

  const hasText = draft.prompt.trim().length > 0 || (mic?.target === "prompt" && interim.trim().length > 0);
  const hasPhoto = !!draft.photo;
  // The photo alone is enough.
  const canSend = hasText || hasPhoto;
  const photoInput = (capture: boolean, label: string, cls: string) => (
    <label className={cls} onClick={beforePicker}>
      {label}
      <input type="file" accept="image/*" {...(capture ? { capture: "environment" as const } : {})} onChange={(e) => void onPhotoPicked(e)} className="sr-only" disabled={photoBusy || tidying || starting} />
    </label>
  );
  const listeningLabel = (target: SpokenTarget) =>
    mic?.target === target ? (mic.ready ? "listening…" : "connecting…") : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Generate the process</h2>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none px-1" aria-label="Close">×</button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          {hasPhoto
            ? "Anything the photo gets wrong or leaves out — say it or type it. Your words win over the photo."
            : "Describe it the way you would to a colleague: who does what, in what order, and any decisions along the way — or photograph a whiteboard or sketch of it."}
        </p>

        {hasPhoto ? (
          <div className="flex items-start gap-3 mb-2">
            {photoUrl && (
              <button type="button" onClick={() => setViewing(true)} className="shrink-0" aria-label="View the photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="The whiteboard photo" className="h-28 w-auto max-w-[45vw] rounded-lg border border-gray-200 object-contain bg-gray-50" />
              </button>
            )}
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-[11px] text-gray-500">📷 {draft.photo!.width ? `${draft.photo!.width} × ${draft.photo!.height}` : "Photo kept"}</span>
              {photoInput(true, "Retake", "text-blue-600 underline")}
              {photoInput(false, "Replace", "text-blue-600 underline")}
              <button type="button" onClick={removePhoto} disabled={starting} className="text-left text-blue-600 underline disabled:opacity-40">Remove</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mb-2">
            {photoInput(true, "📷 Take photo", "h-11 px-4 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50 flex items-center")}
            {photoInput(false, "🖼 Choose photo", "h-11 px-4 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50 flex items-center")}
          </div>
        )}
        {hasPhoto && (
          <label className="mb-2 flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={draft.freeForm === true} disabled={starting}
              onChange={(e) => { const on = e.target.checked; setDraft((d) => ({ ...d, freeForm: on })); }}
              className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Free Form — keep the layout as drawn on the board
              <span className="block text-[11px] text-gray-500">Off: the AI lays the process out neatly instead.</span>
            </span>
          </label>
        )}
        {photoBusy && <p className="text-[11px] text-gray-500 mb-2">Preparing photo…</p>}
        {photoMsg && <p className="text-[11px] text-amber-600 mb-2">{photoMsg}</p>}

        <textarea
          value={draft.prompt}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({ ...d, prompt: v }));
          }}
          readOnly={tidying}
          rows={7}
          placeholder={hasPhoto ? "e.g. The approval happens before payment…" : "e.g. A customer submits a claim online. The claims officer checks the policy…"}
          className="w-full text-base text-gray-900 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-50"
        />
        {mic?.target === "prompt" && interim && (
          <p className="text-[13px] text-gray-400 italic mt-1">{interim}</p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => void micRef.current?.toggle("prompt")}
            disabled={tidying}
            className={`h-11 px-4 rounded-full text-sm font-medium flex items-center gap-1.5 disabled:opacity-40 ${mic?.target === "prompt"
              ? "bg-red-50 text-red-600 animate-pulse"
              : "bg-pink-600 text-white active:bg-pink-700"}`}
          >
            <span className="text-lg leading-none">{mic?.target === "prompt" ? "■" : "🎤"}</span>
            {mic?.target === "prompt" ? "Stop" : "Speak"}
          </button>
          {listeningLabel("prompt") && <span className="text-[11px] text-gray-500">{listeningLabel("prompt")}</span>}
          <span className="flex-1" />
          {!hasPhoto && (
            <button onClick={() => void openSaved()} disabled={tidying} className="text-sm text-blue-600 px-1 py-2 disabled:opacity-40">
              {showSaved ? "Hide saved" : "Saved prompts"}
            </button>
          )}
        </div>
        {micMsg && <p className="text-[11px] text-amber-600 mt-1">{micMsg}</p>}
        <button type="button" onClick={() => setShowMicTest((v) => !v)}
          className="mt-1 text-[11px] text-gray-500 underline active:text-gray-700">
          {showMicTest ? "Hide mic test" : "Mic not working? Test it"}
        </button>
        {showMicTest && <div className="mt-2"><MicTest compact /></div>}

        {showSaved && !hasPhoto && (
          <div className="mt-2 border border-gray-200 rounded-lg max-h-[35vh] overflow-y-auto">
            {saved === null && <p className="text-[11px] text-gray-500 p-3">Loading…</p>}
            {savedErr && <p className="text-[11px] text-amber-600 p-3">{savedErr}</p>}
            {saved && saved.length === 0 && !savedErr && (
              <p className="text-[11px] text-gray-500 p-3">No saved BPMN prompts yet.</p>
            )}
            {saved?.map((p) => (
              <button key={p.id} onClick={() => pickSaved(p)}
                className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 active:bg-gray-50">
                <span className="block text-sm text-gray-900 truncate">{p.name}</span>
                <span className="block text-[11px] text-gray-500 truncate">{p.text}</span>
              </button>
            ))}
          </div>
        )}
        {draft.selected && (
          <p className="text-[11px] text-gray-500 mt-1 truncate">
            From saved prompt: <span className="text-gray-700">{draft.selected.name}</span>
            {draft.selected.text.trim() !== draft.prompt.trim() && " (changed — a new prompt is saved for this diagram)"}
          </p>
        )}

        {!hasPhoto && <div className="flex items-center gap-2 mt-3">
          <button onClick={() => void tidy()} disabled={!hasText || tidying || photoBusy}
            className="h-10 px-4 text-sm text-gray-700 border border-gray-300 rounded-lg disabled:opacity-40 active:bg-gray-50">
            {tidying ? "Tidying…" : "✨ Tidy"}
          </button>
          <span className="text-[11px] text-gray-500 flex-1">
            {tidyMsg ?? "Optional: the AI orders your words into clear steps and asks about anything unclear."}
          </span>
          {beforeTidy && !tidying && <button onClick={undoTidy} className="text-[11px] text-blue-600 underline px-1">Undo</button>}
        </div>}

        {draft.questions.length > 0 && (
          <div className="mt-3 space-y-3">
            {draft.questions.map((x, i) => (
              <div key={i}>
                <p className="text-[13px] text-gray-800 mb-1">{x.q}</p>
                <div className="flex items-start gap-2">
                  <textarea
                    value={x.a}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => ({ ...d, questions: d.questions.map((y, j) => (j === i ? { ...y, a: v } : y)) }));
                    }}
                    readOnly={tidying}
                    rows={2}
                    placeholder="Your answer (optional)"
                    className="flex-1 text-base text-gray-900 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-50"
                  />
                  <button onClick={() => void micRef.current?.toggle(i)} disabled={tidying}
                    aria-label={mic?.target === i ? "Stop" : "Speak the answer"}
                    className={`h-10 w-10 shrink-0 rounded-full text-base disabled:opacity-40 ${mic?.target === i
                      ? "bg-red-50 text-red-600 animate-pulse"
                      : "bg-pink-600 text-white active:bg-pink-700"}`}>
                    {mic?.target === i ? "■" : "🎤"}
                  </button>
                </div>
                {mic?.target === i && (interim || listeningLabel(i)) && (
                  <p className="text-[11px] text-gray-400 italic mt-0.5">{interim || listeningLabel(i)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-500 mt-4">
          Takes a minute or two. You can lock your phone or leave this screen — the diagram is saved when it’s ready.
        </p>
        {error && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg active:bg-gray-50">Cancel</button>
          <button onClick={generate} disabled={!canSend || starting || tidying || photoBusy}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-40 active:bg-blue-700">
            {starting ? (hasPhoto && !draft.photo?.storedId ? "Sending photo…" : "Starting…") : "Generate"}
          </button>
        </div>
      </div>
      {viewing && photoUrl && <MobilePhotoViewer src={photoUrl} alt="The whiteboard photo" onClose={() => setViewing(false)} />}
    </div>
  );
}

/** A URL to show the draft's photo: its local copy, or — restored from a failed run — the kept one. */
function usePhotoUrl(photo: GenerateDraft["photo"], diagramId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const blob = photo?.blob;
  const storedId = photo?.storedId;
  useEffect(() => {
    if (blob) {
      const u = URL.createObjectURL(blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(storedId ? sourceImageUrl(diagramId, storedId) : null);
    return undefined;
  }, [blob, storedId, diagramId]);
  return url;
}
