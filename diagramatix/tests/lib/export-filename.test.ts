/**
 * IO-07 — `safeExportName` sanitises a user-controlled diagram/project title
 * before it is interpolated into a `Content-Disposition` filename. The raw name
 * was previously dropped straight into the header, so a `"` or CR/LF could break
 * out of the quoted filename and inject response headers, and the Windows/macOS
 * filename-invalid set produced unusable downloads.
 */
import { describe, it, expect } from "vitest";
import { safeExportName } from "@/app/lib/exportFilename";

describe("safeExportName (IO-07)", () => {
  it("passes an ordinary name through unchanged", () => {
    expect(safeExportName("Order to Cash")).toBe("Order to Cash");
  });

  it("strips CR/LF (the header-injection vector)", () => {
    const out = safeExportName('bad"\r\nSet-Cookie: x=1');
    expect(out).not.toContain("\r");
    expect(out).not.toContain("\n");
    expect(out).not.toContain('"');
  });

  it("replaces filename-invalid characters", () => {
    expect(safeExportName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("collapses runs of whitespace introduced by stripped control chars", () => {
    expect(safeExportName("a\t\tb")).toBe("a b");
  });

  it("falls back when the name is empty or only invalid chars", () => {
    expect(safeExportName("")).toBe("diagram");
    expect(safeExportName(null)).toBe("diagram");
    expect(safeExportName("   ")).toBe("diagram");
    expect(safeExportName("\r\n\t", "Project")).toBe("Project");
  });

  it("caps overly long names", () => {
    expect(safeExportName("x".repeat(500)).length).toBe(120);
  });
});
