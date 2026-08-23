import { createEmptyHighlightPlans, invalidateHighlightPlans, type SavedHighlightPlans } from "./highlight-plan";

export const ANNOTATION_SCHEMA_VERSION = 3 as const;

export type PlayerId = "A" | "B";
export type Phase = "approach" | "rim" | "below";
export type ShotOutcome = "made_2" | "made_3" | "missed" | "unreviewed";

export type Rect = { x: number; y: number; x2: number; y2: number };

export type Keyframe = {
  id: string;
  time_seconds: number;
  phase: Phase;
  box: Rect;
};

export type ShotRecord = {
  id: string;
  kind: "shot";
  player: PlayerId;
  result_time_seconds: number;
  outcome: ShotOutcome;
  trajectory: Keyframe[];
};

export type DefenseRecord = {
  id: string;
  kind: "defense";
  player: PlayerId;
  time_seconds: number;
};

export type AnnotationRecord = ShotRecord | DefenseRecord;

export type AnnotationProject = {
  schema_version: typeof ANNOTATION_SCHEMA_VERSION;
  source_video: {
    name: string;
    width: number;
    height: number;
    fps: number;
    duration_seconds: number;
  };
  hoop_region: Rect | null;
  players: Record<PlayerId, string>;
  previous_scores: Record<PlayerId, number>;
  records: AnnotationRecord[];
  highlight_plans: SavedHighlightPlans;
};

export type ProjectAction =
  | { type: "replace"; project: AnnotationProject }
  | { type: "set_video"; video: Partial<AnnotationProject["source_video"]> }
  | { type: "set_hoop"; hoop: Rect | null }
  | { type: "set_player_name"; player: PlayerId; name: string }
  | { type: "set_previous_score"; player: PlayerId; score: number }
  | { type: "add_record"; record: AnnotationRecord }
  | { type: "update_shot"; id: string; patch: Partial<Pick<ShotRecord, "player" | "outcome" | "result_time_seconds">> }
  | { type: "update_defense"; id: string; patch: Partial<Pick<DefenseRecord, "player" | "time_seconds">> }
  | { type: "delete_record"; id: string }
  | { type: "replace_records"; records: AnnotationRecord[] }
  | { type: "add_keyframe"; shotId: string; keyframe: Keyframe }
  | { type: "update_keyframe"; shotId: string; keyframeId: string; patch: Partial<Pick<Keyframe, "time_seconds" | "phase" | "box">> }
  | { type: "delete_keyframe"; shotId: string; keyframeId: string };

export function createAnnotationProject(videoName = ""): AnnotationProject {
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION,
    source_video: {
      name: videoName,
      width: 1920,
      height: 1080,
      fps: 30,
      duration_seconds: 0,
    },
    hoop_region: null,
    players: { A: "甲", B: "乙" },
    previous_scores: { A: 0, B: 0 },
    records: [],
    highlight_plans: createEmptyHighlightPlans(),
  };
}

export function mergeOpenedVideo(
  project: AnnotationProject,
  video: Pick<AnnotationProject["source_video"], "name" | "width" | "height" | "duration_seconds">,
): AnnotationProject {
  return {
    ...project,
    source_video: { ...project.source_video, ...video },
  };
}

export function timelineDurationFor(project: AnnotationProject): number {
  if (project.source_video.duration_seconds > 0) return project.source_video.duration_seconds;
  return project.records.reduce((duration, record) => {
    const keyframeDuration = record.kind === "shot"
      ? record.trajectory.reduce((latest, keyframe) => Math.max(latest, keyframe.time_seconds), 0)
      : 0;
    return Math.max(duration, recordTime(record), keyframeDuration);
  }, 0);
}

export function projectReducer(project: AnnotationProject, action: ProjectAction): AnnotationProject {
  switch (action.type) {
    case "replace":
      return action.project;
    case "set_video":
      return { ...project, source_video: { ...project.source_video, ...action.video } };
    case "set_hoop":
      return { ...project, hoop_region: action.hoop };
    case "set_player_name":
      return { ...project, players: { ...project.players, [action.player]: action.name } };
    case "set_previous_score":
      return { ...project, previous_scores: { ...project.previous_scores, [action.player]: Math.max(0, action.score) } };
    case "add_record":
      return { ...project, records: [...project.records, action.record] };
    case "update_shot":
      return invalidateHighlightIntent(updateRecord(project, action.id, (record) =>
        record.kind === "shot" ? { ...record, ...action.patch } : record,
      ), [action.id]);
    case "update_defense":
      return invalidateHighlightIntent(updateRecord(project, action.id, (record) =>
        record.kind === "defense" ? { ...record, ...action.patch } : record,
      ), [action.id]);
    case "delete_record":
      return invalidateHighlightIntent(
        { ...project, records: project.records.filter((record) => record.id !== action.id) },
        [action.id],
        true,
      );
    case "replace_records":
      return invalidateHighlightIntent(
        { ...project, records: action.records },
        project.records.filter((record) => !action.records.some((candidate) => candidate.id === record.id)).map((record) => record.id),
        true,
      );
    case "add_keyframe":
      return updateShot(project, action.shotId, (shot) => ({
        ...shot,
        trajectory: [...shot.trajectory, action.keyframe].sort(byTime),
      }));
    case "update_keyframe":
      return updateShot(project, action.shotId, (shot) => ({
        ...shot,
        trajectory: shot.trajectory
          .map((keyframe) => keyframe.id === action.keyframeId ? { ...keyframe, ...action.patch } : keyframe)
          .sort(byTime),
      }));
    case "delete_keyframe":
      return updateShot(project, action.shotId, (shot) => ({
        ...shot,
        trajectory: shot.trajectory.filter((keyframe) => keyframe.id !== action.keyframeId),
      }));
  }
}

function invalidateHighlightIntent(
  project: AnnotationProject,
  recordIds: string[],
  removeRecords = false,
): AnnotationProject {
  return { ...project, highlight_plans: invalidateHighlightPlans(project.highlight_plans, recordIds, removeRecords) };
}

function updateRecord(
  project: AnnotationProject,
  id: string,
  update: (record: AnnotationRecord) => AnnotationRecord,
): AnnotationProject {
  return {
    ...project,
    records: project.records.map((record) => record.id === id ? update(record) : record),
  };
}

function updateShot(
  project: AnnotationProject,
  id: string,
  update: (record: ShotRecord) => ShotRecord,
): AnnotationProject {
  return updateRecord(project, id, (record) => record.kind === "shot" ? update(record) : record);
}

function byTime(a: Keyframe, b: Keyframe) {
  return a.time_seconds - b.time_seconds;
}

export function scoreFor(project: AnnotationProject, player: PlayerId): number {
  const current = project.records.reduce((total, record) => {
    if (record.kind !== "shot" || record.player !== player) return total;
    if (record.outcome === "made_2") return total + 2;
    if (record.outcome === "made_3") return total + 3;
    return total;
  }, 0);
  return project.previous_scores[player] + current;
}

export function recordTime(record: AnnotationRecord): number {
  return record.kind === "shot" ? record.result_time_seconds : record.time_seconds;
}

export function serializeAnnotationProject(project: AnnotationProject): string {
  return JSON.stringify(project, null, 2);
}

export function projectFileName(project: AnnotationProject): string {
  const base = project.source_video.name.replace(/\.[^/.]+$/, "") || "basketball";
  return `${base}-annotation-project.json`;
}

export function parseAnnotationProject(value: unknown): { project: AnnotationProject; migratedFromLegacy: boolean; warnings: string[] } {
  if (!isObject(value)) throw new Error("工程文件不是有效的 JSON 对象。");
  if (value.schema_version === ANNOTATION_SCHEMA_VERSION) {
    const project = parseVersioned(value);
    const parsedPlans = parseHighlightPlans(value.highlight_plans, project.records, project.source_video.duration_seconds);
    project.highlight_plans = parsedPlans.plans;
    return { project, migratedFromLegacy: false, warnings: parsedPlans.warnings };
  }
  if (value.schema_version === 2) {
    return { project: parseVersioned(value), migratedFromLegacy: false, warnings: [] };
  }
  if (value.schema_version !== undefined) throw new Error(`不支持的工程版本：${String(value.schema_version)}`);
  return { project: migrateLegacy(value), migratedFromLegacy: true, warnings: [] };
}

function parseVersioned(value: Record<string, unknown>): AnnotationProject {
  const source = isObject(value.source_video) ? value.source_video : {};
  const project = createAnnotationProject(asString(source.name));
  project.source_video = {
    name: asString(source.name),
    width: positiveNumber(source.width, 1920),
    height: positiveNumber(source.height, 1080),
    fps: positiveNumber(source.fps, 30),
    duration_seconds: nonNegativeNumber(source.duration_seconds, 0),
  };
  project.hoop_region = parseRect(value.hoop_region);
  project.players = parsePlayers(value.players);
  project.previous_scores = parseScores(value.previous_scores);
  project.records = Array.isArray(value.records)
    ? value.records.map(parseRecord).filter((record): record is AnnotationRecord => record !== null)
    : [];
  return project;
}

function parseHighlightPlans(
  value: unknown,
  records: AnnotationRecord[],
  videoDuration: number,
): { plans: SavedHighlightPlans; warnings: string[] } {
  const plans = createEmptyHighlightPlans();
  if (value === undefined) return { plans, warnings: [] };
  if (!isObject(value)) return { plans, warnings: ["高光方案格式无效，已按默认规则重建。"] };
  const recordIds = new Set(records.map((record) => record.id));
  const recordsById = new Map(records.map((record) => [record.id, record]));
  let invalid = false;
  for (const scope of ["all", "A", "B"] as const) {
    const candidate = value[scope];
    if (candidate === undefined) continue;
    if (!isObject(candidate)) {
      invalid = true;
      continue;
    }
    const excluded = Array.isArray(candidate.excluded_record_ids)
      ? candidate.excluded_record_ids.filter((id): id is string => {
          const valid = typeof id === "string" && recordIds.has(id);
          if (!valid) invalid = true;
          return valid;
        })
      : [];
    if (candidate.excluded_record_ids !== undefined && !Array.isArray(candidate.excluded_record_ids)) invalid = true;
    const edits = Array.isArray(candidate.segment_edits)
      ? candidate.segment_edits.flatMap((edit) => {
          if (!isObject(edit) || !Array.isArray(edit.record_ids)) {
            invalid = true;
            return [];
          }
          const ids = edit.record_ids.filter((id): id is string => typeof id === "string" && recordIds.has(id));
          const startSeconds = typeof edit.start_seconds === "number" ? edit.start_seconds : Number.NaN;
          const endSeconds = typeof edit.end_seconds === "number" ? edit.end_seconds : Number.NaN;
          const referenced = ids.map((id) => recordsById.get(id)).filter((record): record is AnnotationRecord => Boolean(record));
          const valid = ids.length === edit.record_ids.length
            && ids.length > 0
            && Number.isFinite(startSeconds)
            && startSeconds >= 0
            && Number.isFinite(endSeconds)
            && endSeconds > startSeconds
            && (videoDuration <= 0 || endSeconds <= videoDuration)
            && referenced.every((record) => isPositiveHighlight(record)
              && (scope === "all" || record.player === scope)
              && startSeconds <= recordTime(record)
              && endSeconds >= recordTime(record));
          if (!valid) {
            invalid = true;
            return [];
          }
          return [{ record_ids: [...new Set(ids)].sort(), start_seconds: startSeconds, end_seconds: endSeconds }];
        })
      : [];
    if (candidate.segment_edits !== undefined && !Array.isArray(candidate.segment_edits)) invalid = true;
    plans[scope] = { excluded_record_ids: [...new Set(excluded)], segment_edits: edits };
  }
  return {
    plans,
    warnings: invalid ? ["部分高光方案无效，已按默认规则重建。"] : [],
  };
}

function isPositiveHighlight(record: AnnotationRecord): boolean {
  return record.kind === "defense" || record.outcome === "made_2" || record.outcome === "made_3";
}

function parseRecord(value: unknown, index: number): AnnotationRecord | null {
  if (!isObject(value)) return null;
  const player = parsePlayer(value.player);
  if (value.kind === "defense") {
    return {
      id: asString(value.id) || `defense-${index}`,
      kind: "defense",
      player,
      time_seconds: nonNegativeNumber(value.time_seconds, 0),
    };
  }
  if (value.kind !== "shot") return null;
  return {
    id: asString(value.id) || `shot-${index}`,
    kind: "shot",
    player,
    result_time_seconds: nonNegativeNumber(value.result_time_seconds, 0),
    outcome: parseOutcome(value.outcome),
    trajectory: Array.isArray(value.trajectory)
      ? value.trajectory.map(parseKeyframe).filter((frame): frame is Keyframe => frame !== null).sort(byTime)
      : [],
  };
}

function parseKeyframe(value: unknown, index: number): Keyframe | null {
  if (!isObject(value)) return null;
  const box = parseRect(value.box);
  if (!box) return null;
  return {
    id: asString(value.id) || `keyframe-${index}`,
    time_seconds: nonNegativeNumber(value.time_seconds, 0),
    phase: parsePhase(value.phase),
    box,
  };
}

function migrateLegacy(value: Record<string, unknown>): AnnotationProject {
  const project = createAnnotationProject(asString(value.source_video));
  project.hoop_region = parseLegacyRect(value.rim_roi);
  project.players = parseLegacyPlayers(value.players);
  project.previous_scores = parseLegacyScores(value.previous_scores);

  const trajectories = groupLegacyBoxes(value.basketball_boxes);
  const events = Array.isArray(value.shot_events) ? value.shot_events.filter(isObject) : [];
  const shotEvents = events.filter((event) => event.event !== "good_defense");
  const recordCount = Math.max(trajectories.length, shotEvents.length);

  for (let index = 0; index < recordCount; index += 1) {
    const event = shotEvents[index];
    const trajectory = trajectories[index] ?? [];
    project.records.push({
      id: `legacy-shot-${index + 1}`,
      kind: "shot",
      player: parseLegacyPlayer(event?.scorer),
      result_time_seconds: nonNegativeNumber(event?.time_seconds, trajectory.at(-1)?.time_seconds ?? 0),
      outcome: legacyOutcome(event),
      trajectory,
    });
  }

  events.filter((event) => event.event === "good_defense").forEach((event, index) => {
    project.records.push({
      id: `legacy-defense-${index + 1}`,
      kind: "defense",
      player: parseLegacyPlayer(event.scorer),
      time_seconds: nonNegativeNumber(event.time_seconds, 0),
    });
  });
  project.records.sort((a, b) => recordTime(a) - recordTime(b));
  return project;
}

function groupLegacyBoxes(value: unknown): Keyframe[][] {
  if (!Array.isArray(value)) return [];
  const groups: Keyframe[][] = [];
  let current: Keyframe[] = [];
  value.forEach((item, index) => {
    if (!isObject(item)) return;
    const box = parseLegacyRect([item.x, item.y, item.x2, item.y2]);
    if (!box) return;
    const phase = parsePhase(item.phase);
    if (phase === "approach" && current.some((frame) => frame.phase === "rim" || frame.phase === "below")) {
      groups.push(current);
      current = [];
    }
    current.push({
      id: `legacy-keyframe-${index + 1}`,
      time_seconds: nonNegativeNumber(item.time_seconds, 0),
      phase,
      box,
    });
  });
  if (current.length) groups.push(current);
  return groups;
}

function legacyOutcome(event: Record<string, unknown> | undefined): ShotOutcome {
  if (!event) return "unreviewed";
  if (event.event === "missed_shot") return "missed";
  if (event.event === "made_basket" && event.points === 3) return "made_3";
  if (event.event === "made_basket") return "made_2";
  return "unreviewed";
}

function parseLegacyPlayers(value: unknown): Record<PlayerId, string> {
  if (!isObject(value)) return { A: "甲", B: "乙" };
  return { A: asString(value["甲"]) || "甲", B: asString(value["乙"]) || "乙" };
}

function parseLegacyScores(value: unknown): Record<PlayerId, number> {
  if (!isObject(value)) return { A: 0, B: 0 };
  return { A: nonNegativeNumber(value["甲"], 0), B: nonNegativeNumber(value["乙"], 0) };
}

function parsePlayers(value: unknown): Record<PlayerId, string> {
  if (!isObject(value)) return { A: "甲", B: "乙" };
  return { A: asString(value.A) || "甲", B: asString(value.B) || "乙" };
}

function parseScores(value: unknown): Record<PlayerId, number> {
  if (!isObject(value)) return { A: 0, B: 0 };
  return { A: nonNegativeNumber(value.A, 0), B: nonNegativeNumber(value.B, 0) };
}

function parseLegacyRect(value: unknown): Rect | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((part) => typeof part === "number")) return null;
  return normalizeRect({ x: value[0], y: value[1], x2: value[2], y2: value[3] });
}

function parseRect(value: unknown): Rect | null {
  if (!isObject(value)) return null;
  if (![value.x, value.y, value.x2, value.y2].every((part) => typeof part === "number")) return null;
  return normalizeRect(value as Rect);
}

function normalizeRect(rect: Rect): Rect {
  return {
    x: Math.min(rect.x, rect.x2),
    y: Math.min(rect.y, rect.y2),
    x2: Math.max(rect.x, rect.x2),
    y2: Math.max(rect.y, rect.y2),
  };
}

function parsePhase(value: unknown): Phase {
  return value === "rim" || value === "below" ? value : "approach";
}

function parseOutcome(value: unknown): ShotOutcome {
  return value === "made_2" || value === "made_3" || value === "missed" ? value : "unreviewed";
}

function parsePlayer(value: unknown): PlayerId {
  return value === "B" ? "B" : "A";
}

function parseLegacyPlayer(value: unknown): PlayerId {
  return value === "乙" || value === "B" ? "B" : "A";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
