import { describe, expect, it } from "vitest";
import legacyFixture from "../../tests/fixtures/legacy-annotation.json";
import {
  createAnnotationProject,
  mergeOpenedVideo,
  parseAnnotationProject,
  projectReducer,
  scoreFor,
  serializeAnnotationProject,
  timelineDurationFor,
  type ShotRecord,
} from "./annotation-project";

describe("Annotation Project", () => {
  it("keeps one Shot Record and its Keyframes editable through the Module interface", () => {
    const shot: ShotRecord = {
      id: "shot-1",
      kind: "shot",
      player: "A",
      result_time_seconds: 8,
      outcome: "made_2",
      trajectory: [],
    };
    let project = projectReducer(createAnnotationProject("game.mp4"), { type: "add_record", record: shot });
    project = projectReducer(project, {
      type: "add_keyframe",
      shotId: shot.id,
      keyframe: { id: "frame-2", phase: "rim", time_seconds: 7, box: { x: 20, y: 20, x2: 30, y2: 30 } },
    });
    project = projectReducer(project, {
      type: "add_keyframe",
      shotId: shot.id,
      keyframe: { id: "frame-1", phase: "approach", time_seconds: 6, box: { x: 10, y: 10, x2: 20, y2: 20 } },
    });
    project = projectReducer(project, {
      type: "update_keyframe",
      shotId: shot.id,
      keyframeId: "frame-2",
      patch: { time_seconds: 7.25 },
    });

    const saved = project.records[0];
    expect(saved.kind).toBe("shot");
    if (saved.kind !== "shot") throw new Error("Expected a shot");
    expect(saved.trajectory.map((frame) => frame.id)).toEqual(["frame-1", "frame-2"]);
    expect(saved.trajectory[1].time_seconds).toBe(7.25);
    expect(scoreFor(project, "A")).toBe(2);
  });

  it("migrates legacy flat boxes into grouped Shot Records", () => {
    const legacy = {
      source_video: "game.mp4",
      rim_roi: [90, 40, 110, 60],
      players: { 甲: "小王", 乙: "小李" },
      basketball_boxes: [
        { x: 1, y: 1, x2: 3, y2: 3, phase: "approach", time_seconds: 1 },
        { x: 2, y: 2, x2: 4, y2: 4, phase: "rim", time_seconds: 2 },
        { x: 3, y: 3, x2: 5, y2: 5, phase: "below", time_seconds: 3 },
        { x: 8, y: 8, x2: 10, y2: 10, phase: "approach", time_seconds: 8 },
      ],
      shot_events: [
        { scorer: "甲", event: "made_basket", points: 2, time_seconds: 3 },
        { scorer: "乙", event: "missed_shot", time_seconds: 9 },
      ],
    };

    const result = parseAnnotationProject(legacy);
    expect(result.migratedFromLegacy).toBe(true);
    expect(result.project.players).toEqual({ A: "小王", B: "小李" });
    expect(result.project.records).toHaveLength(2);
    expect(result.project.records[0]).toMatchObject({ kind: "shot", outcome: "made_2" });
    expect(result.project.records[1]).toMatchObject({ kind: "shot", outcome: "missed" });
    if (result.project.records[0].kind !== "shot") throw new Error("Expected a shot");
    expect(result.project.records[0].trajectory).toHaveLength(3);
  });

  it("round-trips the versioned project format", () => {
    const source = createAnnotationProject("game.mp4");
    const parsed = parseAnnotationProject(JSON.parse(serializeAnnotationProject(source)) as unknown);
    expect(parsed.migratedFromLegacy).toBe(false);
    expect(parsed.project).toEqual(source);
  });

  it("imports the repository's original annotation fixture", () => {
    const parsed = parseAnnotationProject(legacyFixture);
    expect(parsed.migratedFromLegacy).toBe(true);
    expect(parsed.project.hoop_region).not.toBeNull();
    expect(parsed.project.records.some((record) => record.kind === "shot")).toBe(true);
  });

  it("keeps opened-video metadata when a legacy project is imported afterwards", () => {
    const imported = parseAnnotationProject(legacyFixture).project;
    const merged = mergeOpenedVideo(imported, {
      name: "game.mp4",
      width: 3840,
      height: 2160,
      duration_seconds: 125,
    });

    expect(merged.source_video).toMatchObject({
      name: "game.mp4",
      width: 3840,
      height: 2160,
      duration_seconds: 125,
    });
    expect(merged.records).toEqual(imported.records);
    expect(timelineDurationFor(imported)).toBeGreaterThan(0);
  });

  it("replaces records when navigating record history", () => {
    const first: ShotRecord = { id: "first", kind: "shot", player: "A", result_time_seconds: 1, outcome: "made_2", trajectory: [] };
    const second: ShotRecord = { id: "second", kind: "shot", player: "B", result_time_seconds: 2, outcome: "missed", trajectory: [] };
    let project = projectReducer(createAnnotationProject("game.mp4"), { type: "add_record", record: first });
    project = projectReducer(project, { type: "add_record", record: second });

    project = projectReducer(project, { type: "replace_records", records: [first] });

    expect(project.records).toEqual([first]);
  });
});
