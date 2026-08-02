import { createHash } from "crypto";

/** Digest of an AI-generated SOP section body — stored as `SopSection.aiBodyHash`
 *  when prose is (re)generated, and compared against the current body at regenerate
 *  time to tell whether the author edited the section. Server-only (uses crypto). */
export const sopBodyHash = (body: string): string => createHash("sha256").update(body ?? "").digest("hex");
