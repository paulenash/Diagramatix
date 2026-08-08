/**
 * Server-side DOCX → PDF via headless LibreOffice (`soffice`).
 *
 * Used to give a TRUE-to-layout preview of Word exports (SOP documents, Diff
 * reports) — reproducing the exact headings, org Word-template branding, page
 * breaks, and the landscape figure page that the mammoth (docx→HTML) content
 * preview cannot show. The resulting PDF is previewed in the existing
 * `kind:"pdf"` iframe path.
 *
 * Requires `libreoffice` in the runtime image (see Dockerfile runner stage).
 * Callers MUST treat this as best-effort: if `soffice` is missing (e.g. local
 * dev) or conversion fails, it throws — the caller falls back to the mammoth
 * content preview so Preview never breaks.
 *
 * Concurrency: each call uses its own temp dir AND its own LibreOffice user
 * profile (`-env:UserInstallation`), so parallel conversions don't contend on a
 * shared profile lock.
 */
import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const TIMEOUT_MS = 60_000;

export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "dgx-doc2pdf-"));
  const inPath = join(dir, "in.docx");
  const outPath = join(dir, "in.pdf");
  const profileUrl = pathToFileURL(join(dir, "profile")).href;
  try {
    await writeFile(inPath, docx);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        SOFFICE,
        [
          "--headless", "--nologo", "--nolockcheck", "--nodefault", "--norestore",
          "--convert-to", "pdf:writer_pdf_Export",
          "--outdir", dir,
          inPath,
          `-env:UserInstallation=${profileUrl}`,
        ],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("soffice timed out")); }, TIMEOUT_MS);
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`soffice exited ${code}`)); });
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
