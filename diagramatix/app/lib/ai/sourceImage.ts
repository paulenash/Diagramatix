/**
 * The image an AI generation was drawn from — kept, so it can be looked at
 * again and re-attached on a re-generate.
 *
 * Paul, 2026-09-28: "generating from an image which needs "Free Form" set on
 * seems to work fine, but I need a way to view the image after the diagram has
 * been generated" — and "When re-generating there is no way to check "Free
 * Form" for the regenerated diagram". The image was never kept: it lived in the
 * console's memory, went to the model once, and was gone. So a re-generate had
 * no image, the "reproduce the layout" choice (which needs one) was hidden, the
 * model was told "I have attached an image…" and drew from the file name, and
 * the result lost its free-form layout.
 *
 * Stored once per organisation (by SHA-256) in `AiSourceImage`; the diagram
 * keeps only `data.aiGeneration.sourceImage` = {id, name, mimeType, size}.
 * Served only through a diagram (app/api/diagrams/[id]/source-image/…).
 *
 * The client half lives here; the routes do the checking.
 */

/** The image as the diagram records it. */
export interface StoredSourceImage {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/** What a console hands over at apply time: the image in memory, or the stored one it was re-attached from. */
export interface ApplySourceImage {
  name: string;
  mediaType: string;
  /** base64, when the image came from the user's file. */
  data?: string;
  /** Set when it was re-attached from the diagram's stored image — nothing to upload. */
  storedId?: string;
  width?: number;
  height?: number;
}

/** The four image types the model reads, and the only ones stored. */
export const SOURCE_IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** The consoles' own attachment cap. */
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

export function sourceImageUrl(diagramId: string, imageId: string): string {
  return `/api/diagrams/${encodeURIComponent(diagramId)}/source-image/${encodeURIComponent(imageId)}`;
}

/**
 * Free Form on a re-generate: what was chosen last time, else ON when the
 * diagram is free-form now (the diagrams generated before the choice was
 * recorded still say it through `relaxedLayout`) — else undefined, which
 * leaves the console's own default (ticked) alone. Returning false there
 * unticked it for every text-generated diagram (the 2026-09-28 review).
 */
export function regenerateFreeForm(gen: { freeForm?: boolean } | undefined | null, relaxedLayout: boolean | undefined): boolean | undefined {
  return gen?.freeForm ?? (relaxedLayout === true ? true : undefined);
}

/** The file a "from an image" prompt names — "(Pizza Delivery.jpg)" — for the "attach it again" note. */
export function imageNameInPrompt(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/\(([^()\n]+\.(?:png|jpe?g|gif|webp))\)/i);
  return m ? m[1] : null;
}

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
};

/**
 * Keep the image with the diagram, returning the record to put on it — or null
 * when it could not be kept (the diagram is still applied; only the link is
 * missing). An image re-attached from the diagram's own store is not sent again.
 */
export async function storeSourceImage(
  diagramId: string,
  img: ApplySourceImage,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredSourceImage | null> {
  const size = { ...(img.width ? { width: img.width } : {}), ...(img.height ? { height: img.height } : {}) };
  if (img.storedId) return { id: img.storedId, name: img.name, mimeType: img.mediaType, ...size };
  if (!img.data || !SOURCE_IMAGE_TYPES.includes(img.mediaType)) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([base64ToBytes(img.data) as BlobPart], { type: img.mediaType }), img.name);
    if (img.width) form.append("width", String(Math.round(img.width)));
    if (img.height) form.append("height", String(Math.round(img.height)));
    const res = await fetchImpl(`/api/diagrams/${encodeURIComponent(diagramId)}/source-image`, { method: "POST", body: form });
    if (!res.ok) return null;
    const j = await res.json() as Partial<StoredSourceImage>;
    return typeof j.id === "string" ? { id: j.id, name: j.name ?? img.name, mimeType: j.mimeType ?? img.mediaType, ...size } : null;
  } catch {
    return null;
  }
}

/** A stored image as the consoles hold an attachment (base64), for re-attaching on a re-generate. */
export async function loadSourceImage(
  diagramId: string,
  stored: StoredSourceImage,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetchImpl(sourceImageUrl(diagramId, stored.id));
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { data: bytesToBase64(bytes), mediaType: res.headers.get("content-type") || stored.mimeType };
  } catch {
    return null;
  }
}
