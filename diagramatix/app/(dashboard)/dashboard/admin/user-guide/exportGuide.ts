/**
 * Export the whole User Guide to Markdown, with images packaged so they render
 * outside the running app:
 *   - exportGuideZip          → User-Guide.zip (User-Guide.md + images/ folder, relative links)
 *   - exportGuideSelfContained → a single User-Guide.md with images inlined as base64 data URIs
 * Image bytes are fetched client-side from their (auth-gated) URLs.
 */
import JSZip from "jszip";

type Section = {
  heading: string | null; bodyMarkdown: string; adminOnly: boolean;
  image: string | null; imageAlt: string | null; imageCaption: string | null;
};
type Chapter = { slug: string; title: string; adminOnly: boolean; sections: Section[] };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function localImageName(url: string, i: number): string {
  let base = (url.split("/").filter(Boolean).pop() || `image-${i}`).split("?")[0];
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(base)) base = `${base || `image-${i}`}.png`;
  return base.replace(/[^\w.-]+/g, "-");
}

// Inline Markdown image: ![alt](url) — capture the url to repoint it on export.
const INLINE_IMG = /(!\[[^\]]*\]\()([^)\s]+)(\))/g;

function buildMarkdown(chapters: Chapter[], imgRef: (url: string) => string | null): string {
  const out: string[] = [];
  chapters.forEach((c, ci) => {
    out.push(`# ${ci + 1}. ${c.title || c.slug}${c.adminOnly ? "  _(SuperAdmin only)_" : ""}`, "");
    c.sections.forEach((s) => {
      if (s.heading) out.push(`## ${s.heading}${s.adminOnly ? "  _(SuperAdmin only)_" : ""}`, "");
      if (s.bodyMarkdown.trim()) {
        // Repoint inline body images (references → packaged file / data URI).
        out.push(s.bodyMarkdown.trim().replace(INLINE_IMG, (full, pre, url, post) => {
          const ref = imgRef(url);
          return ref ? `${pre}${ref}${post}` : full;
        }), "");
      }
      if (s.image) {
        const ref = imgRef(s.image);
        if (ref) {
          out.push(`![${s.imageAlt ?? ""}](${ref})`);
          if (s.imageCaption) out.push("", `*${s.imageCaption}*`);
          out.push("");
        }
      }
    });
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Every image the guide references — section image fields + inline body images.
function uniqueImageUrls(chapters: Chapter[]): string[] {
  const urls = new Set<string>();
  for (const c of chapters) {
    for (const s of c.sections) {
      if (s.image) urls.add(s.image);
      let m: RegExpExecArray | null;
      const re = new RegExp(INLINE_IMG);
      while ((m = re.exec(s.bodyMarkdown))) urls.add(m[2]);
    }
  }
  return Array.from(urls);
}

async function fetchImage(url: string): Promise<Blob | null> {
  try { const r = await fetch(url); return r.ok ? await r.blob() : null; } catch { return null; }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

export async function exportGuideZip(chapters: Chapter[]) {
  const zip = new JSZip();
  const imgFolder = zip.folder("images")!;
  const nameByUrl = new Map<string, string>();
  let i = 0;
  for (const url of uniqueImageUrls(chapters)) {
    const blob = await fetchImage(url);
    if (!blob) continue;
    let name = localImageName(url, i++);
    while ([...nameByUrl.values()].includes(name)) name = `${i}-${name}`;
    nameByUrl.set(url, name);
    imgFolder.file(name, blob);
  }
  zip.file("User-Guide.md", buildMarkdown(chapters, (url) => {
    const n = nameByUrl.get(url);
    return n ? `images/${n}` : null;
  }));
  download(await zip.generateAsync({ type: "blob" }), "User-Guide.zip");
}

export async function exportGuideSelfContained(chapters: Chapter[]) {
  const dataByUrl = new Map<string, string>();
  for (const url of uniqueImageUrls(chapters)) {
    const blob = await fetchImage(url);
    if (blob) dataByUrl.set(url, await blobToDataUrl(blob));
  }
  const md = buildMarkdown(chapters, (url) => dataByUrl.get(url) ?? null);
  download(new Blob([md], { type: "text/markdown" }), "User-Guide.md");
}
