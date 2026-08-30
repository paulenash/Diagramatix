/**
 * Server-side SVG → PDF via headless LibreOffice.
 *
 * A near-copy of `docxToPdf.ts`, and deliberately so: `soffice` is already in
 * the runtime image with the Liberation and Noto fonts, so this adds no
 * dependency and no image weight. LibreOffice Draw imports SVG and exports PDF,
 * which is the whole job.
 *
 * Concurrency is capped. Each call spawns a real office suite on the same
 * instance as everything else, and an unbounded queue of them is how a machine
 * falls over — a partner API is exactly the caller that would find that out.
 */
import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const TIMEOUT_MS = 60_000;
const MAX_CONCURRENT = 2;

let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) { running++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}
function release(): void {
  running--;
  const next = waiting.shift();
  if (next) next();
}

/** Thrown when the renderer is unavailable, so a caller can degrade rather than
 *  fail. There is no `soffice` in local dev, and a missing PDF must never fail
 *  an otherwise successful process map. */
export class PdfUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "PdfUnavailableError"; }
}

export async function svgToPdf(svg: string): Promise<Buffer> {
  if (!svg.trim()) throw new PdfUnavailableError("There is nothing to render.");

  await acquire();
  const dir = await mkdtemp(join(tmpdir(), "dgx-svg2pdf-"));
  const inPath = join(dir, "in.svg");
  const outPath = join(dir, "in.pdf");
  // Its own user profile per call, so parallel conversions do not contend on a
  // shared profile lock — the same reason docxToPdf does it.
  const profileUrl = pathToFileURL(join(dir, "profile")).href;

  try {
    await writeFile(inPath, svg, "utf8");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        SOFFICE,
        [
          "--headless", "--nologo", "--nolockcheck", "--nodefault", "--norestore",
          "--convert-to", "pdf:draw_pdf_Export",
          "--outdir", dir,
          inPath,
          `-env:UserInstallation=${profileUrl}`,
        ],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new PdfUnavailableError("The renderer timed out.")); }, TIMEOUT_MS);
      child.on("error", (e) => { clearTimeout(timer); reject(new PdfUnavailableError(`The renderer is not available: ${e.message}`)); });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new PdfUnavailableError(`The renderer exited with code ${code}.`));
      });
    });
    return await readFile(outPath);
  } catch (e) {
    if (e instanceof PdfUnavailableError) throw e;
    throw new PdfUnavailableError(e instanceof Error ? e.message : String(e));
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
