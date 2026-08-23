import type { HighlightSegment } from "./highlight-plan";

export type HighlightPlaybackDecision =
  | { type: "continue" }
  | { type: "seek"; segment_index: number; start_seconds: number }
  | { type: "stop" };

export function decideHighlightPlayback(
  segments: HighlightSegment[],
  segmentIndex: number,
  currentTime: number,
): HighlightPlaybackDecision {
  const current = segments[segmentIndex];
  if (!current) return { type: "stop" };
  if (currentTime < current.end_seconds - 0.03) return { type: "continue" };
  const next = segments[segmentIndex + 1];
  return next
    ? { type: "seek", segment_index: segmentIndex + 1, start_seconds: next.start_seconds }
    : { type: "stop" };
}
