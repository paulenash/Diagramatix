/**
 * WebVTT (Microsoft Teams transcript) → speaker-labelled plain text.
 */
import { describe, it, expect } from "vitest";
import { parseVtt, isVttFile } from "@/app/lib/dictation/audioInput";

describe("parseVtt", () => {
  it("extracts speaker names from <v> voice tags and merges consecutive cues", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:04.000",
      "<v Paul Nash>We start by receiving the order.</v>",
      "",
      "00:00:04.000 --> 00:00:07.000",
      "<v Paul Nash>Then we check stock.</v>",
      "",
      "00:00:07.000 --> 00:00:10.000",
      "<v Greg Nash>If in stock, we ship it.</v>",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toBe(
      "Paul Nash: We start by receiving the order. Then we check stock.\n" +
      "Greg Nash: If in stock, we ship it.",
    );
  });

  it("handles a leading 'Name:' convention and numeric cue indices", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:00.000 --> 00:00:02.000",
      "Sales: Take the order.",
      "",
      "2",
      "00:00:02.000 --> 00:00:04.000",
      "Ops: Pick the stock.",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toBe("Sales: Take the order.\nOps: Pick the stock.");
  });

  it("strips stray markup and keeps unlabelled lines", () => {
    const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nplain <b>text</b> here\n";
    expect(parseVtt(vtt)).toBe("plain text here");
  });

  it("isVttFile recognises .vtt by name or mime", () => {
    expect(isVttFile({ name: "meeting.vtt", type: "" } as File)).toBe(true);
    expect(isVttFile({ name: "x", type: "text/vtt" } as File)).toBe(true);
    expect(isVttFile({ name: "talk.mp3", type: "audio/mpeg" } as File)).toBe(false);
  });
});
