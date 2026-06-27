/**
 * Image-format guard for the User Guide image library — uploads are restricted
 * to browser-displayable formats so a stored image never renders as broken.
 */
import { describe, it, expect } from "vitest";
import { isAllowedImage, ALLOWED_IMAGE_MIME, IMAGE_ACCEPT } from "@/app/lib/help/imageFormats";

describe("isAllowedImage", () => {
  it("accepts every browser-displayable image MIME type", () => {
    for (const mt of [
      "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
      "image/svg+xml", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon",
    ]) {
      expect(isAllowedImage(mt, "x"), mt).toBe(true);
    }
  });

  it("rejects non-displayable image MIME types (TIFF / HEIC / PSD / RAW)", () => {
    for (const mt of ["image/tiff", "image/heic", "image/heif", "image/x-photoshop", "image/x-canon-cr2"]) {
      expect(isAllowedImage(mt, "scan.tiff"), mt).toBe(false);
    }
  });

  it("treats a concrete image/* MIME as authoritative over the extension", () => {
    expect(isAllowedImage("image/tiff", "looks-like.png")).toBe(false); // MIME wins → reject
    expect(isAllowedImage("image/png", "weird.tiff")).toBe(true);       // MIME wins → accept
  });

  it("falls back to the extension when the MIME is empty or generic", () => {
    expect(isAllowedImage("", "capture.png")).toBe(true);
    expect(isAllowedImage("application/octet-stream", "diagram.jpg")).toBe(true);
    expect(isAllowedImage("", "logo.svg")).toBe(true);
    expect(isAllowedImage("", "scan.tiff")).toBe(false);
    expect(isAllowedImage("application/octet-stream", "photo.heic")).toBe(false);
  });

  it("is case-insensitive for both MIME and extension", () => {
    expect(isAllowedImage("IMAGE/PNG", "X")).toBe(true);
    expect(isAllowedImage("", "PHOTO.JPG")).toBe(true);
  });

  it("rejects when there is neither a usable MIME nor a known extension", () => {
    expect(isAllowedImage("", "")).toBe(false);
    expect(isAllowedImage(null, null)).toBe(false);
    expect(isAllowedImage(undefined, "noext")).toBe(false);
  });

  it("the upload accept attribute lists the allowed extensions + MIME types", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"]) {
      expect(IMAGE_ACCEPT).toContain(`.${ext}`);
    }
    for (const mt of ALLOWED_IMAGE_MIME) {
      if (mt === "image/vnd.microsoft.icon") continue; // accept uses the image/x-icon alias
      expect(IMAGE_ACCEPT).toContain(mt);
    }
  });
});
