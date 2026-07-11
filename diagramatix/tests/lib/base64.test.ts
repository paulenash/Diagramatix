/**
 * arrayBufferToBase64 (T0707) — encodes any-size ArrayBuffer without hitting the
 * call-stack argument limit. The old `btoa(String.fromCharCode(...bytes))`
 * spread threw RangeError for larger files, silently breaking AI-Generate
 * attachments (most visibly PNGs, which are much bigger than the same JPEG).
 */
import { describe, it, expect } from "vitest";
import { arrayBufferToBase64 } from "@/app/lib/base64";

describe("arrayBufferToBase64 (T0707)", () => {
  it("round-trips a small buffer", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66, 67]);
    const b64 = arrayBufferToBase64(bytes.buffer);
    const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect([...back]).toEqual([...bytes]);
  });

  it("encodes a large (~500 KB) buffer without throwing, and round-trips", () => {
    const n = 500_000; // well past the ~125k spread-argument limit that broke PNGs
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) & 0xff;
    // The naive spread would throw here; the chunked encoder must not.
    let b64 = "";
    expect(() => { b64 = arrayBufferToBase64(bytes.buffer); }).not.toThrow();
    const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(back.length).toBe(n);
    expect(back[0]).toBe(bytes[0]);
    expect(back[n - 1]).toBe(bytes[n - 1]);
    expect(back[250_000]).toBe(bytes[250_000]);
  });
});
