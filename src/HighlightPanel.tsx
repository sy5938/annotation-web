import type { AnnotationProject } from "./domain/annotation-project";
import type {
  HighlightPlanCommand,
  HighlightScope,
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

type HighlightOverviewTimelineProps = {
  project: AnnotationProject;
  view: HighlightView;
  segmentIndex: number;
  currentTime: number;
  previewing: boolean;
  onCommand: (command: HighlightPlanCommand) => void;
  onSelect: (segmentIndex: number) => void;
  onPlay: (segmentIndex: number) => void;
};

export function HighlightOverviewTimeline({
  project,
  view,
  segmentIndex,
  currentTime,
  previewing,
  onCommand,
  onSelect,
  onPlay,
}: HighlightOverviewTimelineProps) {
  const duration = project.source_video.duration_seconds;
  const firstSegment = view.segments[0];
  const lastSegment = view.segments[view.segments.length - 1];
  const selectedSegment = view.segments[segmentIndex];
  const selectedEvents = selectedSegment
    ? view.events.filter((event) => selectedSegment.record_ids.includes(event.record_id))
    : [];
  const earliestEvent = Math.min(...selectedEvents.map((event) => event.time_seconds));
  const latestEvent = Math.max(...selectedEvents.map((event) => event.time_seconds));
  const position = (time: number) => duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;
  const setBoundary = (start: number, end: number) => {
    if (!selectedSegment) return;
    onCommand({
      type: "set-segment-boundaries",
      record_ids: selectedSegment.record_ids,
      start_seconds: start,
      end_seconds: end,
    });
  };

  return (
    <section className="highlight-overview-panel" aria-label="高光整体时间轴">
      <div className="highlight-overview-heading">
        <div><strong>高光整体视图</strong><span>{selectedSegment ? `片段 ${segmentIndex + 1}/${view.segments.length} · ${formatTime(selectedSegment.start_seconds)} – ${formatTime(selectedSegment.end_seconds)} · 直接拖动时间轴手柄` : "完整视频中的所有保留区间和事件点"}</span></div>
        <div className="highlight-overview-summary">
          <span>分布 <strong>{firstSegment && lastSegment ? `${formatTime(firstSegment.start_seconds)} – ${formatTime(lastSegment.end_seconds)}` : "—"}</strong></span>
          <span>保留 <strong>{formatTime(view.total_seconds)}</strong></span>
          <span><strong>{view.segments.length}</strong> 段</span>
        </div>
        {selectedSegment && <div className="highlight-segment-nav">
          <button onClick={() => onSelect(segmentIndex - 1)} disabled={segmentIndex === 0}>上一段</button>
          <button className="primary-action" onClick={() => onPlay(segmentIndex)}>{previewing ? "重新播放" : "播放本段"}</button>
          <button onClick={() => onSelect(segmentIndex + 1)} disabled={segmentIndex === view.segments.length - 1}>下一段</button>
          <button onClick={() => onCommand({ type: "reset-segment", record_ids: selectedSegment.record_ids })}>恢复前五后三</button>
        </div>}
      </div>
      <div className={duration > 0 ? "highlight-overview-track" : "highlight-overview-track disabled"}>
        {view.segments.map((segment, index) => <button
          className={index === segmentIndex ? "highlight-overview-segment selected" : "highlight-overview-segment"}
          style={{ left: `${position(segment.start_seconds)}%`, width: `${position(segment.end_seconds) - position(segment.start_seconds)}%` }}
          aria-label={`选择高光片段 ${index + 1}，${formatTime(segment.start_seconds)} 到 ${formatTime(segment.end_seconds)}`}
          onClick={() => onSelect(index)}
          key={segment.record_ids.join("|")}
        />)}
        {view.events.filter((event) => event.included).map((event) => {
          const index = view.segments.findIndex((segment) => segment.record_ids.includes(event.record_id));
          return <button
            className={`highlight-overview-event ${event.kind === "defense" ? "defense" : "made"}`}
            style={{ left: `${position(event.time_seconds)}%` }}
            title={`${project.players[event.player] || event.player} · ${eventLabels[event.kind]} · ${formatTime(event.time_seconds)}`}
            aria-label={`选择${project.players[event.player] || event.player}的${eventLabels[event.kind]}，${formatTime(event.time_seconds)}`}
            onClick={() => onSelect(index)}
            key={event.record_id}
          ><span>{event.kind === "made_2" ? "+2" : event.kind === "made_3" ? "+3" : "D"}</span></button>;
        })}
        {duration > 0 && <div className="highlight-overview-playhead" style={{ left: `${position(currentTime)}%` }} />}
        {selectedSegment && <>
          <input
            className="highlight-overview-range start"
            aria-label="高光开始时间"
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={selectedSegment.start_seconds}
            onChange={(event) => setBoundary(Math.min(Number(event.target.value), earliestEvent), selectedSegment.end_seconds)}
          />
          <input
            className="highlight-overview-range end"
            aria-label="高光结束时间"
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={selectedSegment.end_seconds}
            onChange={(event) => setBoundary(selectedSegment.start_seconds, Math.max(Number(event.target.value), latestEvent))}
          />
        </>}
      </div>
      <div className="highlight-overview-scale"><span>0:00</span><span>{formatTime(duration / 2)}</span><span>{formatTime(duration)}</span></div>
    </section>
  );
}
