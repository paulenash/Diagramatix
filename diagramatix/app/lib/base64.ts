/**
 * Base64-encode an ArrayBuffer WITHOUT blowing the call-stack argument limit.
 *
 * The obvious `btoa(String.fromCharCode(...new Uint8Array(buf)))` spreads every
 * byte as a separate function argument, which throws `RangeError: Maximum call
 * stack size exceeded` once a file is more than a few hundred KB. That silently
 * broke attaching larger files to AI Generate — most visibly PNGs, which are
 * lossless and much bigger than the same image as a JPEG. Encoding in 32 KB
 * chunks stays within the argument limit for any size.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 KB per String.fromCharCode.apply call
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
