import { describe, expect, it } from "vitest";
import { decideHighlightPlayback } from "./highlight-playback";
import type { HighlightSegment } from "./highlight-plan";

const segments: HighlightSegment[] = [
  { record_ids: ["one"], start_seconds: 5, end_seconds: 13, default_start_seconds: 5, default_end_seconds: 13 },
  { record_ids: ["two"], start_seconds: 20, end_seconds: 28, default_start_seconds: 20, default_end_seconds: 28 },
];

describe("highlight playback", () => {
  it("continues inside a segment", () => {
    expect(decideHighlightPlayback(segments, 0, 10)).toEqual({ type: "continue" });
  });

  it("seeks to the next segment at the current end", () => {
    expect(decideHighlightPlayback(segments, 0, 13)).toEqual({ type: "seek", segment_index: 1, start_seconds: 20 });
  });

  it("stops after the final segment or an invalid selection", () => {
    expect(decideHighlightPlayback(segments, 1, 28)).toEqual({ type: "stop" });
    expect(decideHighlightPlayback(segments, 4, 28)).toEqual({ type: "stop" });
  });
});
