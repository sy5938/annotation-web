import type { Keyframe } from "./annotation-project";

export function visibleKeyframesAtTime(
  keyframes: Keyframe[],
  selectedKeyframeId: string | null,
  currentTime: number,
  fps: number,
): Keyframe[] {
  if (selectedKeyframeId) {
    return keyframes.filter((keyframe) => keyframe.id === selectedKeyframeId);
  }
  const tolerance = Math.max(0.15, 0.5 / Math.max(1, fps));
  return keyframes.filter((keyframe) => Math.abs(keyframe.time_seconds - currentTime) <= tolerance);
}
