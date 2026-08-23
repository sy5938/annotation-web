import type { AnnotationProject, AnnotationRecord, PlayerId } from "./annotation-project";

export type HighlightScope = "all" | PlayerId;

export type SavedHighlightSegmentEdit = {
  record_ids: string[];
  start_seconds: number;
  end_seconds: number;
};

export type SavedHighlightPlan = {
  excluded_record_ids: string[];
  segment_edits: SavedHighlightSegmentEdit[];
};

export type SavedHighlightPlans = Record<HighlightScope, SavedHighlightPlan>;

export type HighlightEvent = {
  record_id: string;
  player: PlayerId;
  kind: "made_2" | "made_3" | "defense";
  time_seconds: number;
  included: boolean;
};

export type HighlightSegment = {
  record_ids: string[];
  start_seconds: number;
  end_seconds: number;
  default_start_seconds: number;
  default_end_seconds: number;
};

export type ShootingSummary = {
  player: PlayerId;
  made: number;
  attempts: number;
  percentage: number | null;
  good_defenses: number;
};

export type HighlightView = {
  ready: boolean;
  scope: HighlightScope;
  events: HighlightEvent[];
  segments: HighlightSegment[];
  summaries: ShootingSummary[];
  unreviewed_count: number;
  total_seconds: number;
};

export type HighlightPlanCommand =
  | { type: "set-record-included"; record_id: string; included: boolean }
  | { type: "set-segment-boundaries"; record_ids: string[]; start_seconds: number; end_seconds: number }
  | { type: "reset-segment"; record_ids: string[] }
  | { type: "reset-scope" };

export function createEmptyHighlightPlans(): SavedHighlightPlans {
  return {
    all: emptyPlan(),
    A: emptyPlan(),
    B: emptyPlan(),
  };
}

export function buildHighlightView(project: AnnotationProject, scope: HighlightScope): HighlightView {
  const plan = project.highlight_plans[scope];
  const events = project.records
    .map(toHighlightEvent)
    .filter((event): event is HighlightEvent => event !== null && (scope === "all" || event.player === scope))
    .sort((a, b) => a.time_seconds - b.time_seconds)
    .map((event) => ({ ...event, included: !plan.excluded_record_ids.includes(event.record_id) }));
  const summaries = (scope === "all" ? ["A", "B"] as PlayerId[] : [scope])
    .map((player) => shootingSummary(project.records, player));
  const unreviewedCount = project.records.filter((record) =>
    record.kind === "shot"
      && record.outcome === "unreviewed"
      && (scope === "all" || record.player === scope)
  ).length;

  if (project.source_video.duration_seconds <= 0) {
    return {
      ready: false,
      scope,
      events,
      segments: [],
      summaries,
      unreviewed_count: unreviewedCount,
      total_seconds: 0,
    };
  }

  const included = events.filter((event) => event.included);
  const defaults = mergeSegments(included.map((event) => eventWindow(event, project.source_video.duration_seconds)));
  const segments = applyEdits(defaults, plan.segment_edits, included, project.source_video.duration_seconds);
  return {
    ready: true,
    scope,
    events,
    segments,
    summaries,
    unreviewed_count: unreviewedCount,
    total_seconds: round(segments.reduce((total, segment) => total + segment.end_seconds - segment.start_seconds, 0)),
  };
}

export function updateHighlightPlan(
  project: AnnotationProject,
  scope: HighlightScope,
  command: HighlightPlanCommand,
): AnnotationProject {
  const current = project.highlight_plans[scope];
  let next: SavedHighlightPlan;
  if (command.type === "reset-scope") {
    next = emptyPlan();
  } else if (command.type === "set-record-included") {
    const excluded = new Set(current.excluded_record_ids);
    if (command.included) excluded.delete(command.record_id);
    else excluded.add(command.record_id);
    next = { ...current, excluded_record_ids: [...excluded] };
  } else {
    const recordIds = normalizedIds(command.record_ids);
    const edits = current.segment_edits.filter((edit) => !isSubset(edit.record_ids, recordIds));
    if (command.type === "reset-segment") {
      next = { ...current, segment_edits: edits };
    } else {
      const segment = buildHighlightView(project, scope).segments.find((candidate) => sameIds(candidate.record_ids, recordIds));
      const eventTimes = project.records
        .filter((record) => recordIds.includes(record.id))
        .map(recordTime);
      const valid = segment
        && eventTimes.length > 0
        && Number.isFinite(command.start_seconds)
        && Number.isFinite(command.end_seconds)
        && command.start_seconds >= 0
        && command.end_seconds <= project.source_video.duration_seconds
        && command.start_seconds < command.end_seconds
        && eventTimes.every((time) => command.start_seconds <= time && command.end_seconds >= time);
      if (!valid) return project;
      next = {
        ...current,
        segment_edits: [...edits, {
          record_ids: recordIds,
          start_seconds: round(command.start_seconds),
          end_seconds: round(command.end_seconds),
        }],
      };
    }
  }
  return {
    ...project,
    highlight_plans: { ...project.highlight_plans, [scope]: next },
  };
}

export function invalidateHighlightPlans(
  plans: SavedHighlightPlans,
  recordIds: string[],
  removeRecords = false,
): SavedHighlightPlans {
  const affected = new Set(recordIds);
  return Object.fromEntries((["all", "A", "B"] as HighlightScope[]).map((scope) => {
    const plan = plans[scope];
    return [scope, {
      excluded_record_ids: removeRecords
        ? plan.excluded_record_ids.filter((id) => !affected.has(id))
        : plan.excluded_record_ids,
      segment_edits: plan.segment_edits.filter((edit) => !edit.record_ids.some((id) => affected.has(id))),
    }];
  })) as SavedHighlightPlans;
}

function emptyPlan(): SavedHighlightPlan {
  return { excluded_record_ids: [], segment_edits: [] };
}

function toHighlightEvent(record: AnnotationRecord): Omit<HighlightEvent, "included"> | null {
  if (record.kind === "defense") {
    return { record_id: record.id, player: record.player, kind: "defense", time_seconds: record.time_seconds };
  }
  if (record.outcome !== "made_2" && record.outcome !== "made_3") return null;
  return {
    record_id: record.id,
    player: record.player,
    kind: record.outcome,
    time_seconds: record.result_time_seconds,
  };
}

function recordTime(record: AnnotationRecord): number {
  return record.kind === "shot" ? record.result_time_seconds : record.time_seconds;
}

function shootingSummary(records: AnnotationRecord[], player: PlayerId): ShootingSummary {
  let made = 0;
  let attempts = 0;
  let goodDefenses = 0;
  for (const record of records) {
    if (record.player !== player) continue;
    if (record.kind === "defense") {
      goodDefenses += 1;
      continue;
    }
    if (record.outcome === "unreviewed") continue;
    attempts += 1;
    if (record.outcome === "made_2" || record.outcome === "made_3") made += 1;
  }
  return {
    player,
    made,
    attempts,
    percentage: attempts ? Number(((made / attempts) * 100).toFixed(1)) : null,
    good_defenses: goodDefenses,
  };
}

function eventWindow(event: HighlightEvent, duration: number): HighlightSegment {
  const time = clamp(event.time_seconds, 0, duration);
  return {
    record_ids: [event.record_id],
    start_seconds: Math.max(0, time - 5),
    end_seconds: Math.min(duration, time + 3),
    default_start_seconds: Math.max(0, time - 5),
    default_end_seconds: Math.min(duration, time + 3),
  };
}

function applyEdits(
  defaults: HighlightSegment[],
  edits: SavedHighlightSegmentEdit[],
  events: HighlightEvent[],
  duration: number,
): HighlightSegment[] {
  let segments = defaults;
  for (let pass = 0; pass <= edits.length; pass += 1) {
    const before = JSON.stringify(segments);
    segments = mergeSegments(segments.map((segment) => {
      const edit = edits.find((candidate) => sameIds(candidate.record_ids, segment.record_ids));
      if (!edit || !validEdit(edit, segment, events, duration)) return segment;
      return { ...segment, start_seconds: edit.start_seconds, end_seconds: edit.end_seconds };
    }));
    if (JSON.stringify(segments) === before) break;
  }
  return segments;
}

function validEdit(
  edit: SavedHighlightSegmentEdit,
  segment: HighlightSegment,
  events: HighlightEvent[],
  duration: number,
): boolean {
  if (!Number.isFinite(edit.start_seconds) || !Number.isFinite(edit.end_seconds)) return false;
  if (edit.start_seconds < 0 || edit.end_seconds > duration || edit.start_seconds >= edit.end_seconds) return false;
  const includedTimes = events
    .filter((event) => segment.record_ids.includes(event.record_id))
    .map((event) => event.time_seconds);
  return includedTimes.every((time) => edit.start_seconds <= time && edit.end_seconds >= time);
}

function mergeSegments(input: HighlightSegment[]): HighlightSegment[] {
  const ordered = input
    .map((segment) => ({ ...segment, record_ids: normalizedIds(segment.record_ids) }))
    .sort((a, b) => a.start_seconds - b.start_seconds);
  const merged: HighlightSegment[] = [];
  for (const segment of ordered) {
    const previous = merged.at(-1);
    if (!previous || segment.start_seconds > previous.end_seconds) {
      merged.push({ ...segment });
      continue;
    }
    previous.end_seconds = Math.max(previous.end_seconds, segment.end_seconds);
    previous.default_start_seconds = Math.min(previous.default_start_seconds, segment.default_start_seconds);
    previous.default_end_seconds = Math.max(previous.default_end_seconds, segment.default_end_seconds);
    previous.record_ids = normalizedIds([...previous.record_ids, ...segment.record_ids]);
  }
  return merged;
}

function sameIds(left: string[], right: string[]): boolean {
  const a = normalizedIds(left);
  const b = normalizedIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function isSubset(candidate: string[], complete: string[]): boolean {
  return candidate.every((id) => complete.includes(id));
}

function normalizedIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
