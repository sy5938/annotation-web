import { describe, expect, it } from "vitest";
import { visibleKeyframesAtTime } from "./keyframe-visibility";
import type { Keyframe } from "./annotation-project";

function keyframe(id: string, time: number): Keyframe {
  return {
    id,
    time_seconds: time,
    phase: "approach",
    box: { x: 0, y: 0, x2: 10, y2: 10 },
  };
}

describe("keyframe visibility", () => {
  const keyframes = [keyframe("selected", 10), keyframe("nearby", 10.01), keyframe("far", 20)];

  it("shows only the selected keyframe at its timestamp", () => {
    expect(visibleKeyframesAtTime(keyframes, "selected", 10.01, 30).map((frame) => frame.id))
      .toEqual(["selected"]);
    expect(visibleKeyframesAtTime(keyframes, "selected", 20, 30)).toEqual([]);
  });

  it("shows nearby keyframes when none is selected", () => {
    expect(visibleKeyframesAtTime(keyframes, null, 10, 30).map((frame) => frame.id))
      .toEqual(["selected", "nearby"]);
  });
});
