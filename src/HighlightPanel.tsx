import type { CSSProperties } from "react";
import type { AnnotationProject } from "./domain/annotation-project";
import type {
  HighlightPlanCommand,
  HighlightScope,
  HighlightSegment,
  HighlightView,
} from "./domain/highlight-plan";
import { formatTime } from "./domain/video-geometry";

type HighlightModeControlsProps = {
  project: AnnotationProject;
  scope: HighlightScope;
  view: HighlightView;
  previewing: boolean;
  onScopeChange: (scope: HighlightScope) => void;
  onCommand: (command: HighlightPlanCommand) => void;
  onStart: () => void;
  onStop: () => void;
};

const eventLabels = {
  made_2: "进 2 分",
  made_3: "进 3 分",
  defense: "Good defense",
};

export function HighlightModeControls({
  project,
  scope,
  view,
  previewing,
  onScopeChange,
  onCommand,
  onStart,
  onStop,
}: HighlightModeControlsProps) {
  const excludedCount = view.events.filter((event) => !event.included).length;

  return (
    <section className="highlight-mode-controls" aria-label="高光范围与摘要">
      <div className="highlight-scopes" role="group" aria-label="高光范围">
        {(["all", "A", "B"] as HighlightScope[]).map((candidate) => <button
          className={scope === candidate ? "active" : ""}
          aria-pressed={scope === candidate}
          onClick={() => onScopeChange(candidate)}
          key={candidate}
        >{candidate === "all" ? "全场" : project.players[candidate] || candidate}</button>)}
      </div>

      <div className="highlight-compact-summary">
        {view.summaries.map((summary) => <span key={summary.player}>
          <strong>{project.players[summary.player] || summary.player}</strong>
          {summary.made}/{summary.attempts} · {summary.percentage === null ? "—" : `${summary.percentage.toFixed(1)}%`}
          {summary.good_defenses > 0 && ` · 防守 ${summary.good_defenses}`}
        </span>)}
        <span><strong>{view.segments.length}</strong> 段 · {formatTime(view.total_seconds)}</span>
      </div>

      {view.unreviewed_count > 0 && <p className="highlight-warning">{view.unreviewed_count} 次投篮待确认，未计入高光。</p>}
      {excludedCount > 0 && <button className="highlight-restore" onClick={() => onCommand({ type: "reset-scope" })}>恢复已移出的 {excludedCount} 条事件</button>}
      <div className="highlight-preview-actions">
        <button className="primary-action" onClick={onStart} disabled={!view.ready || !view.segments.length}>连续预览</button>
        <button onClick={onStop} disabled={!previewing}>停止</button>
      </div>
    </section>
  );
}

type HighlightTrimBarProps = {
  project: AnnotationProject;
  view: HighlightView;
  segmentIndex: number;
  currentTime: number;
  previewing: boolean;
  onCommand: (command: HighlightPlanCommand) => void;
  onSelect: (segmentIndex: number) => void;
  onPlay: (segmentIndex: number) => void;
};

export function HighlightTrimBar({
  project,
  view,
  segmentIndex,
  currentTime,
  previewing,
  onCommand,
  onSelect,
  onPlay,
}: HighlightTrimBarProps) {
  const segment = view.segments[segmentIndex];
  if (!segment) {
    return <section className="highlight-trim-panel"><p className="empty-state">当前范围没有可预览的高光片段。</p></section>;
  }

  const segmentEvents = view.events.filter((event) => segment.record_ids.includes(event.record_id));
  const earliestEvent = Math.min(...segmentEvents.map((event) => event.time_seconds));
  const latestEvent = Math.max(...segmentEvents.map((event) => event.time_seconds));
  const bounds = highlightTrimBounds(segment, project.source_video.duration_seconds);
  const range = Math.max(0.1, bounds.end - bounds.start);
  const startPosition = ((segment.start_seconds - bounds.start) / range) * 100;
  const endPosition = ((segment.end_seconds - bounds.start) / range) * 100;
  const playheadPosition = ((currentTime - bounds.start) / range) * 100;
  const setBoundary = (start: number, end: number) => onCommand({
    type: "set-segment-boundaries",
    record_ids: segment.record_ids,
    start_seconds: start,
    end_seconds: end,
  });

  return (
    <section className="highlight-trim-panel" aria-label="当前高光片段修剪">
      <div className="highlight-trim-heading">
        <div>
          <strong>高光片段 {segmentIndex + 1} / {view.segments.length}</strong>
          <span>{formatTime(segment.start_seconds)} – {formatTime(segment.end_seconds)}</span>
        </div>
        <div className="highlight-segment-nav">
          <button onClick={() => onSelect(segmentIndex - 1)} disabled={segmentIndex === 0}>上一段</button>
          <button className="primary-action" onClick={() => onPlay(segmentIndex)}>{previewing ? "重新播放" : "播放本段"}</button>
          <button onClick={() => onSelect(segmentIndex + 1)} disabled={segmentIndex === view.segments.length - 1}>下一段</button>
          <button onClick={() => onCommand({ type: "reset-segment", record_ids: segment.record_ids })}>恢复前五后三</button>
        </div>
      </div>

      <div className="highlight-current-events">
        {segmentEvents.map((event) => <span key={event.record_id}>{project.players[event.player] || event.player} · {eventLabels[event.kind]} · {formatTime(event.time_seconds)}</span>)}
      </div>

      <div className="highlight-trim-track" style={{ "--trim-start": `${startPosition}%`, "--trim-end": `${endPosition}%` } as CSSProperties}>
        <div className="highlight-trim-selection" />
        {currentTime >= bounds.start && currentTime <= bounds.end && <div className="highlight-trim-playhead" style={{ left: `${playheadPosition}%` }} />}
        {segmentEvents.map((event) => <span className="highlight-event-tick" style={{ left: `${((event.time_seconds - bounds.start) / range) * 100}%` }} key={event.record_id} />)}
        <input
          className="highlight-trim-range start"
          aria-label="高光开始时间"
          type="range"
          min={bounds.start}
          max={bounds.end}
          step="0.1"
          value={segment.start_seconds}
          onChange={(event) => setBoundary(Math.min(Number(event.target.value), earliestEvent), segment.end_seconds)}
        />
        <input
          className="highlight-trim-range end"
          aria-label="高光结束时间"
          type="range"
          min={bounds.start}
          max={bounds.end}
          step="0.1"
          value={segment.end_seconds}
          onChange={(event) => setBoundary(segment.start_seconds, Math.max(Number(event.target.value), latestEvent))}
        />
      </div>
      <div className="highlight-trim-scale"><span>{formatTime(bounds.start)}</span><span>拖动左、右手柄调整当前片段</span><span>{formatTime(bounds.end)}</span></div>
    </section>
  );
}

export function highlightTrimBounds(segment: HighlightSegment, duration: number) {
  return {
    start: Math.max(0, Math.min(segment.start_seconds, segment.default_start_seconds - 5)),
    end: Math.min(duration, Math.max(segment.end_seconds, segment.default_end_seconds + 5)),
  };
}
