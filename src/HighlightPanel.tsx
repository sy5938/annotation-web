import type { AnnotationProject } from "./domain/annotation-project";
import type {
  HighlightPlanCommand,
  HighlightScope,
  HighlightSegment,
  HighlightView,
} from "./domain/highlight-plan";
import { formatTime } from "./domain/video-geometry";

type HighlightPanelProps = {
  project: AnnotationProject;
  scope: HighlightScope;
  view: HighlightView;
  previewing: boolean;
  activeSegmentIndex: number;
  onScopeChange: (scope: HighlightScope) => void;
  onCommand: (command: HighlightPlanCommand) => void;
  onStart: (segmentIndex: number) => void;
  onStop: () => void;
};

const eventLabels = {
  made_2: "进 2 分",
  made_3: "进 3 分",
  defense: "Good defense",
};

export function HighlightPanel({
  project,
  scope,
  view,
  previewing,
  activeSegmentIndex,
  onScopeChange,
  onCommand,
  onStart,
  onStop,
}: HighlightPanelProps) {
  return (
    <section className="highlight-panel" aria-label="高光预览">
      <div className="highlight-heading">
        <div className="panel-heading"><span>03</span><h2>高光预览</h2></div>
        <div className="highlight-scopes" role="group" aria-label="高光范围">
          {(["all", "A", "B"] as HighlightScope[]).map((candidate) => <button
            className={scope === candidate ? "active" : ""}
            aria-pressed={scope === candidate}
            onClick={() => onScopeChange(candidate)}
            key={candidate}
          >{candidate === "all" ? "全场" : project.players[candidate] || candidate}</button>)}
        </div>
        <div className="highlight-actions">
          <button className="primary-action" onClick={() => onStart(0)} disabled={!view.ready || !view.segments.length}>开始预览</button>
          <button onClick={onStop} disabled={!previewing}>退出预览</button>
          <button onClick={() => {
            if (window.confirm("重置当前高光范围的筛选和人工修剪？")) onCommand({ type: "reset-scope" });
          }}>重置当前范围</button>
        </div>
      </div>

      <div className="highlight-summary">
        {view.summaries.map((summary) => <div key={summary.player}>
          <strong>{project.players[summary.player] || summary.player}</strong>
          <span>{summary.made} / {summary.attempts}</span>
          <span>{summary.percentage === null ? "—" : `${summary.percentage.toFixed(1)}%`}</span>
          <span>Good defense：{summary.good_defenses} 次</span>
        </div>)}
        <div className="highlight-totals"><strong>{view.segments.length} 个片段</strong><span>预计 {formatTime(view.total_seconds)}</span></div>
      </div>
      {view.unreviewed_count > 0 && <p className="highlight-warning">还有 {view.unreviewed_count} 次投篮待确认，未计入统计和高光。</p>}

      <div className="highlight-body">
        <section className="highlight-events">
          <h3>纳入高光</h3>
          {view.events.map((event) => <label key={event.record_id}>
            <input
              type="checkbox"
              aria-label={`纳入高光：${project.players[event.player] || event.player} ${eventLabels[event.kind]}`}
              checked={event.included}
              onChange={(change) => onCommand({ type: "set-record-included", record_id: event.record_id, included: change.target.checked })}
            />
            <span><strong>{project.players[event.player] || event.player}</strong><small>{eventLabels[event.kind]} · {formatTime(event.time_seconds)}</small></span>
          </label>)}
          {!view.events.length && <p className="empty-state">当前范围还没有进球或 Good defense。</p>}
        </section>

        <section className="highlight-segments">
          <h3>可修剪片段</h3>
          {view.segments.map((segment, index) => <SegmentEditor
            active={previewing && index === activeSegmentIndex}
            index={index}
            project={project}
            segment={segment}
            view={view}
            onCommand={onCommand}
            onStart={() => onStart(index)}
            key={segment.record_ids.join("|")}
          />)}
          {view.ready && !view.segments.length && <p className="empty-state">没有可预览的高光片段。</p>}
          {!view.ready && <p className="empty-state">请先打开对应视频。</p>}
        </section>
      </div>
    </section>
  );
}

function SegmentEditor({
  active,
  index,
  project,
  segment,
  view,
  onCommand,
  onStart,
}: {
  active: boolean;
  index: number;
  project: AnnotationProject;
  segment: HighlightSegment;
  view: HighlightView;
  onCommand: (command: HighlightPlanCommand) => void;
  onStart: () => void;
}) {
  const segmentEvents = view.events.filter((event) => segment.record_ids.includes(event.record_id));
  const earliestEvent = Math.min(...segmentEvents.map((event) => event.time_seconds));
  const latestEvent = Math.max(...segmentEvents.map((event) => event.time_seconds));
  const setBoundary = (start: number, end: number) => onCommand({
    type: "set-segment-boundaries",
    record_ids: segment.record_ids,
    start_seconds: start,
    end_seconds: end,
  });

  return (
    <article className={active ? "highlight-segment-card active" : "highlight-segment-card"}>
      <div className="highlight-segment-title">
        <button onClick={onStart}><strong>片段 {String(index + 1).padStart(2, "0")}</strong><span>{formatTime(segment.start_seconds)} – {formatTime(segment.end_seconds)}</span></button>
        <button onClick={() => onCommand({ type: "reset-segment", record_ids: segment.record_ids })}>恢复默认</button>
      </div>
      <div className="highlight-segment-events">{segmentEvents.map((event) => <span key={event.record_id}>{project.players[event.player] || event.player} · {eventLabels[event.kind]}</span>)}</div>
      <div className="highlight-boundaries">
        <label>开始
          <input type="range" min="0" max={earliestEvent} step="0.1" value={segment.start_seconds} onChange={(event) => setBoundary(Number(event.target.value), segment.end_seconds)} />
          <input type="number" min="0" max={earliestEvent} step="0.1" value={segment.start_seconds} onChange={(event) => setBoundary(Number(event.target.value), segment.end_seconds)} />
        </label>
        <label>结束
          <input type="range" min={latestEvent} max={project.source_video.duration_seconds} step="0.1" value={segment.end_seconds} onChange={(event) => setBoundary(segment.start_seconds, Number(event.target.value))} />
          <input type="number" min={latestEvent} max={project.source_video.duration_seconds} step="0.1" value={segment.end_seconds} onChange={(event) => setBoundary(segment.start_seconds, Number(event.target.value))} />
        </label>
      </div>
    </article>
  );
}
