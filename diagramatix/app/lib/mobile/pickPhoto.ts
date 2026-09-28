/**
 * A photo the person took or picked, made into the draft's photo (stage 2):
 * shrunk and re-encoded on the phone (photoShrink.ts), named for the prompt.
 * Shared by the Generate sheet's photo buttons and the empty diagram's
 * "Photograph a whiteboard" button. Browser only.
 */
import { photoName, shrinkPhoto, SHRINK_FAILURE_MESSAGE } from "./photoShrink";
import type { DraftPhoto } from "./generateDraft";

export async function photoFromFile(file: File): Promise<{ ok: true; photo: DraftPhoto } | { ok: false; message: string }> {
  const r = await shrinkPhoto(file);
  if (!r.ok) return { ok: false, message: SHRINK_FAILURE_MESSAGE[r.reason] };
  return { ok: true, photo: { blob: r.blob, name: photoName(new Date()), width: r.width, height: r.height } };
}

/** Where the words wait while the camera has the screen (the page can be reloaded meanwhile). */
export const draftStorageKey = (diagramId: string) => `dgx-gen-draft:${diagramId}`;
