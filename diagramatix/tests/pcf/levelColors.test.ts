import { describe, it, expect } from "vitest";
import { lightenHex, normalizeHex, normalizeScheme, pcfLevelStyle, DEFAULT_PCF_LEVEL_COLORS } from "@/app/lib/pcf/levelColors";

describe("PCF level colours (T0680)", () => {
  it("lightenHex mixes toward white by percentage", () => {
    expect(lightenHex("#000000", 0)).toBe("#000000");
    expect(lightenHex("#000000", 100)).toBe("#ffffff");
    expect(lightenHex("#000000", 50)).toBe("#808080"); // 128
    expect(lightenHex("#0000ff", 50)).toBe("#8080ff"); // only the dark channels lift
  });

  it("normalizeHex accepts with/without hash, rejects junk", () => {
    expect(normalizeHex("00426F")).toBe("#00426f");
    expect(normalizeHex("#00426f")).toBe("#00426f");
    expect(normalizeHex("nope")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
  });

  it("pcfLevelStyle: white text on main, main-colour text on the light shade", () => {
    const s = pcfLevelStyle(1);
    expect(s.textOnMain).toBe("#ffffff");
    expect(s.textOnLight).toBe(s.main);      // main colour as text on light bg
    expect(s.light).not.toBe(s.main);        // two distinct tones
  });

  it("pcfLevelStyle falls back to the deepest level for deep nodes", () => {
    const deep = pcfLevelStyle(9);
    const task = pcfLevelStyle(5);
    expect(deep.main).toBe(task.main);
  });

  it("normalizeScheme fills every level from defaults and clamps overrides", () => {
    const merged = normalizeScheme([{ level: 2, main: "AABBCC", lightPct: 200 }]);
    expect(merged).toHaveLength(5);
    const l2 = merged.find((c) => c.level === 2)!;
    expect(l2.main).toBe("#aabbcc");
    expect(l2.lightPct).toBe(100);           // clamped from 200
    // untouched level keeps the default
    expect(merged.find((c) => c.level === 1)!.main).toBe(DEFAULT_PCF_LEVEL_COLORS[0].main);
  });

  it("normalizeScheme ignores malformed input and unknown levels", () => {
    const merged = normalizeScheme([{ level: 99, main: "#fff000" }, { level: 3, main: "bad" }]);
    expect(merged).toHaveLength(5);
    expect(merged.find((c) => c.level === 3)!.main).toBe(DEFAULT_PCF_LEVEL_COLORS[2].main); // bad hex ignored
    expect(merged.some((c) => c.level === 99)).toBe(false);
  });
});
