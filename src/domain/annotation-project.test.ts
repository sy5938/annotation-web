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
  type AnnotationProject,
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
    expect(parsed.warnings).toEqual([]);
    expect(parsed.project).toEqual(source);
  });

  it("keeps initial scores in the total and exports the complete v3 project", () => {
    let source = createAnnotationProject("game.mp4");
    source = projectReducer(source, { type: "set_previous_score", player: "A", score: 11 });
    source = projectReducer(source, { type: "set_previous_score", player: "B", score: 8 });
    source.records = [
      {
        id: "made",
        kind: "shot",
        player: "A",
        outcome: "made_2",
        result_time_seconds: 10,
        trajectory: [{ id: "rim", phase: "rim", time_seconds: 9.5, box: { x: 1, y: 2, x2: 3, y2: 4 } }],
      },
      { id: "missed", kind: "shot", player: "B", outcome: "missed", result_time_seconds: 20, trajectory: [] },
    ];
    source.highlight_plans.A.excluded_record_ids = ["made"];

    const exported = JSON.parse(serializeAnnotationProject(source)) as AnnotationProject;

    expect(scoreFor(source, "A")).toBe(13);
    expect(scoreFor(source, "B")).toBe(8);
    expect(exported.schema_version).toBe(3);
    expect(exported.previous_scores).toEqual({ A: 11, B: 8 });
    expect(exported.records).toEqual(source.records);
    expect(exported.records[0].kind === "shot" && exported.records[0].trajectory).toHaveLength(1);
    expect(exported.highlight_plans).toEqual(source.highlight_plans);
  });

  it("migrates schema v2 with empty highlight plans", () => {
    const versionTwo = JSON.parse(serializeAnnotationProject(createAnnotationProject("game.mp4"))) as Record<string, unknown>;
    versionTwo.schema_version = 2;
    delete versionTwo.highlight_plans;

    const parsed = parseAnnotationProject(versionTwo);

    expect(parsed.migratedFromLegacy).toBe(false);
    expect(parsed.project.schema_version).toBe(3);
    expect(parsed.project.highlight_plans).toEqual({
      all: { excluded_record_ids: [], segment_edits: [] },
      A: { excluded_record_ids: [], segment_edits: [] },
      B: { excluded_record_ids: [], segment_edits: [] },
    });
  });

  it("keeps annotations when saved highlight intent is stale", () => {
    const source = createAnnotationProject("game.mp4");
    source.records.push({ id: "shot-1", kind: "shot", player: "A", result_time_seconds: 10, outcome: "made_2", trajectory: [] });
    const serialized = JSON.parse(serializeAnnotationProject(source)) as Record<string, unknown>;
    serialized.highlight_plans = {
      all: { excluded_record_ids: ["missing"], segment_edits: [] },
      A: { excluded_record_ids: [], segment_edits: [{ record_ids: ["missing"], start_seconds: 1, end_seconds: 2 }] },
      B: { excluded_record_ids: [], segment_edits: [] },
    };

    const parsed = parseAnnotationProject(serialized);

    expect(parsed.project.records).toEqual(source.records);
    expect(parsed.project.highlight_plans.all.excluded_record_ids).toEqual([]);
    expect(parsed.project.highlight_plans.A.segment_edits).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("round-trips saved scope choices and valid segment boundaries", () => {
    const source = createAnnotationProject("game.mp4");
    source.source_video.duration_seconds = 30;
    source.records.push({ id: "shot-1", kind: "shot", player: "A", result_time_seconds: 10, outcome: "made_2", trajectory: [] });
    source.highlight_plans.A = {
      excluded_record_ids: [],
      segment_edits: [{ record_ids: ["shot-1"], start_seconds: 3, end_seconds: 14 }],
    };
    source.highlight_plans.all.excluded_record_ids = ["shot-1"];

    const parsed = parseAnnotationProject(JSON.parse(serializeAnnotationProject(source)) as unknown);

    expect(parsed.project.highlight_plans).toEqual(source.highlight_plans);
    expect(parsed.warnings).toEqual([]);
  });

  it("warns and drops a saved boundary that cuts out its source event", () => {
    const source = createAnnotationProject("game.mp4");
    source.source_video.duration_seconds = 30;
    source.records.push({ id: "shot-1", kind: "shot", player: "A", result_time_seconds: 10, outcome: "made_2", trajectory: [] });
    const serialized = JSON.parse(serializeAnnotationProject(source)) as Record<string, unknown>;
    serialized.highlight_plans = {
      all: { excluded_record_ids: [], segment_edits: [] },
      A: { excluded_record_ids: [], segment_edits: [{ record_ids: ["shot-1"], start_seconds: 11, end_seconds: 14 }] },
      B: { excluded_record_ids: [], segment_edits: [] },
    };

    const parsed = parseAnnotationProject(serialized);

    expect(parsed.project.highlight_plans.A.segment_edits).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("rejects an unsupported future schema instead of treating it as legacy", () => {
    expect(() => parseAnnotationProject({ schema_version: 99 })).toThrow("不支持的工程版本：99");
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
