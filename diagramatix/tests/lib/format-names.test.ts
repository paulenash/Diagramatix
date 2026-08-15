import { describe, it, expect } from "vitest";
import { formatNameList } from "@/app/lib/formatNames";

describe("formatNameList", () => {
  it("formats one, two, and three-plus names in readable English", () => {
    expect(formatNameList(["Greg Nash"])).toBe("Greg Nash");
    expect(formatNameList(["Greg", "Paul"])).toBe("Greg and Paul");
    expect(formatNameList(["Greg", "Paul", "Sam"])).toBe("Greg, Paul and Sam");
  });

  it("trims blanks and falls back to 'Someone' when empty", () => {
    expect(formatNameList([])).toBe("Someone");
    expect(formatNameList(["  ", ""])).toBe("Someone");
    expect(formatNameList([" Greg ", ""])).toBe("Greg");
  });
});
