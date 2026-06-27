"use client";

/**
 * Resolve in-app Image Library references in Markdown to embedded base64 data
 * URIs, so the Markdown renders outside the running app (SharePoint .md, single-
 * file export). Only same-origin library refs are embedded — `/api/help/images/…`
 * and `/help/images/…`; external http(s) URLs are left untouched (they already
 * work anywhere). The library stores each image once; embedding only happens at
 * the moment of producing an external artifact.
 */
const APP_IMG_URL = /(?:\/api\/help\/images\/[A-Za-z0-9_-]+|\/help\/images\/[^\s)"'<>]+)/g;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    // Browser: FileReader. Node (tests / any non-DOM context): arrayBuffer→base64.
    if (typeof FileReader === "undefined") {
      blob.arrayBuffer()
        .then((ab) => res(`data:${blob.type || "application/octet-stream"};base64,${Buffer.from(ab).toString("base64")}`))
        .catch(rej);
      return;
    }
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

async function fetchDataUrl(url: string): Promise<string | null> {
  try { const r = await fetch(url); return r.ok ? await blobToDataUrl(await r.blob()) : null; } catch { return null; }
}

export function findAppImageUrls(text: string): string[] {
  return Array.from(new Set(text.match(APP_IMG_URL) ?? []));
}

export async function embedMarkdownImages(md: string): Promise<string> {
  const urls = findAppImageUrls(md);
  if (urls.length === 0) return md;
  const map = new Map<string, string>();
  for (const u of urls) { const d = await fetchDataUrl(u); if (d) map.set(u, d); }
  return md.replace(APP_IMG_URL, (u) => map.get(u) ?? u);
}
