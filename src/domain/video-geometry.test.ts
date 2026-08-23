import { describe, expect, it } from "vitest";
import { frameStep, pointerToVideoPoint, rectFromPoints } from "./video-geometry";

describe("video time and geometry", () => {
  it("steps with project FPS and clamps to the video", () => {
    expect(frameStep(1, 1, 25, 10)).toBeCloseTo(1.04);
    expect(frameStep(0, -5, 30, 10)).toBe(0);
    expect(frameStep(9.99, 5, 30, 10)).toBe(10);
  });

  it("maps pointer coordinates into source-video pixels", () => {
    expect(pointerToVideoPoint(
      { x: 250, y: 125 },
      { left: 50, top: 25, width: 400, height: 200 },
      { width: 1920, height: 1080 },
    )).toEqual({ x: 960, y: 540 });
  });

  it("normalizes rectangles drawn in any direction", () => {
    expect(rectFromPoints({ x: 20, y: 30 }, { x: 5, y: 10 })).toEqual({ x: 5, y: 10, x2: 20, y2: 30 });
  });
});
