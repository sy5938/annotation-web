import { describe, expect, it } from "vitest";
import { buildPreview } from "./preview";
import type { AnnotationRecord, ShotRecord } from "./annotation-project";

function shot(id: string, time: number): ShotRecord {
  return {
    id,
    kind: "shot",
    player: "A",
    outcome: "made_2",
    result_time_seconds: time,
    trajectory: [],
  };
}

describe("preview segments", () => {
  it("clamps windows to the video and merges overlapping windows", () => {
    const preview = buildPreview([shot("one", 4), shot("two", 12), shot("three", 30)], 32);

    expect(preview.segments).toEqual([
      { start_seconds: 0, end_seconds: 17 },
      { start_seconds: 25, end_seconds: 32 },
    ]);
    expect(preview.total_seconds).toBe(24);
    expect(preview.segment_count).toBe(2);
  });

  it("merges windows whose endpoints touch", () => {
    const preview = buildPreview([shot("one", 10), shot("two", 20)], 40);
    expect(preview.segments).toEqual([{ start_seconds: 5, end_seconds: 25 }]);
    expect(preview.segment_count).toBe(1);
  });

  it("clamps imported shot times before creating windows", () => {
    const preview = buildPreview([shot("before", -3), shot("after", 40)], 30);
    expect(preview.segments).toEqual([
      { start_seconds: 0, end_seconds: 5 },
      { start_seconds: 25, end_seconds: 30 },
    ]);
    expect(preview.total_seconds).toBe(10);
  });

  it("does not create preview windows for good-defense records", () => {
    const records: AnnotationRecord[] = [
      { id: "defense", kind: "defense", player: "A", time_seconds: 12 },
    ];
    expect(buildPreview(records, 30)).toEqual({ ready: true, segments: [], total_seconds: 0, segment_count: 0 });
  });

  it("waits for a known video duration", () => {
    expect(buildPreview([shot("one", 10)], 0)).toEqual({ ready: false, segments: [], total_seconds: 0, segment_count: 0 });
  });
});
