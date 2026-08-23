import { describe, expect, it } from "vitest";
import { createAnnotationProject, type AnnotationRecord } from "./annotation-project";
import { buildHighlightView, invalidateHighlightPlans, updateHighlightPlan } from "./highlight-plan";

function projectWith(records: AnnotationRecord[], duration = 60) {
  return {
    ...createAnnotationProject("game.mp4"),
    source_video: { ...createAnnotationProject().source_video, name: "game.mp4", duration_seconds: duration },
    records,
  };
}

const records: AnnotationRecord[] = [
  { id: "a-two", kind: "shot", player: "A", result_time_seconds: 10, outcome: "made_2", trajectory: [] },
  { id: "a-miss", kind: "shot", player: "A", result_time_seconds: 15, outcome: "missed", trajectory: [] },
  { id: "a-defense", kind: "defense", player: "A", time_seconds: 12 },
  { id: "a-pending", kind: "shot", player: "A", result_time_seconds: 20, outcome: "unreviewed", trajectory: [] },
  { id: "b-three", kind: "shot", player: "B", result_time_seconds: 30, outcome: "made_3", trajectory: [] },
];

describe("Highlight Plan", () => {
  it("selects positive highlights by scope and reports real shooting summaries", () => {
    const project = projectWith(records);
    const all = buildHighlightView(project, "all");
    const playerA = buildHighlightView(project, "A");

    expect(all.events.map((event) => event.record_id)).toEqual(["a-two", "a-defense", "b-three"]);
    expect(playerA.events.map((event) => event.record_id)).toEqual(["a-two", "a-defense"]);
    expect(playerA.summaries).toEqual([{ player: "A", made: 1, attempts: 2, percentage: 50, good_defenses: 1 }]);
    expect(playerA.unreviewed_count).toBe(1);
  });

  it("uses five seconds before and three after, then merges while retaining record IDs", () => {
    const view = buildHighlightView(projectWith(records), "A");
    expect(view.segments).toEqual([{
      record_ids: ["a-defense", "a-two"],
      start_seconds: 5,
      end_seconds: 15,
      default_start_seconds: 5,
      default_end_seconds: 15,
    }]);
    expect(view.total_seconds).toBe(10);
  });

  it("keeps inclusion choices independent between scopes without changing statistics", () => {
    const source = projectWith(records);
    const changed = updateHighlightPlan(source, "A", { type: "set-record-included", record_id: "a-two", included: false });

    expect(buildHighlightView(changed, "A").events.find((event) => event.record_id === "a-two")?.included).toBe(false);
    expect(buildHighlightView(changed, "all").events.find((event) => event.record_id === "a-two")?.included).toBe(true);
    expect(buildHighlightView(changed, "A").summaries[0]).toMatchObject({ made: 1, attempts: 2, percentage: 50 });
  });

  it("applies valid boundary edits, rejects edits that cut out events, and remerges overlaps", () => {
    const source = projectWith([
      { id: "one", kind: "shot", player: "A", result_time_seconds: 10, outcome: "made_2", trajectory: [] },
      { id: "two", kind: "shot", player: "A", result_time_seconds: 22, outcome: "made_3", trajectory: [] },
    ], 40);
    const first = buildHighlightView(source, "A").segments[0];
    const expanded = updateHighlightPlan(source, "A", {
      type: "set-segment-boundaries",
      record_ids: first.record_ids,
      start_seconds: 3,
      end_seconds: 20,
    });
    expect(buildHighlightView(expanded, "A").segments).toHaveLength(1);
    expect(buildHighlightView(expanded, "A").segments[0]).toMatchObject({ start_seconds: 3, end_seconds: 25, record_ids: ["one", "two"] });

    const invalid = updateHighlightPlan(source, "A", {
      type: "set-segment-boundaries",
      record_ids: first.record_ids,
      start_seconds: 11,
      end_seconds: 13,
    });
    expect(buildHighlightView(invalid, "A").segments[0]).toMatchObject({ start_seconds: 5, end_seconds: 13 });
  });

  it("resets affected boundaries while retaining per-scope inclusion intent", () => {
    const source = projectWith(records);
    const changed = updateHighlightPlan(
      updateHighlightPlan(source, "A", { type: "set-record-included", record_id: "a-two", included: false }),
      "A",
      { type: "set-segment-boundaries", record_ids: ["a-defense"], start_seconds: 2, end_seconds: 16 },
    );

    const invalidated = invalidateHighlightPlans(changed.highlight_plans, ["a-defense"]);

    expect(invalidated.A.excluded_record_ids).toEqual(["a-two"]);
    expect(invalidated.A.segment_edits).toEqual([]);
  });
});
