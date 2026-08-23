import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HighlightModeControls, HighlightOverviewTimeline, HighlightTrimBar, highlightTrimBounds } from "./HighlightPanel";
import { createAnnotationProject } from "./domain/annotation-project";
import { buildHighlightView } from "./domain/highlight-plan";

function highlightedProject() {
  const project = createAnnotationProject("game.mp4");
  project.source_video.duration_seconds = 40;
  project.players.A = "小王";
  project.records = [
    { id: "made", kind: "shot" as const, player: "A" as const, outcome: "made_2" as const, result_time_seconds: 10, trajectory: [] },
    { id: "missed", kind: "shot" as const, player: "A" as const, outcome: "missed" as const, result_time_seconds: 20, trajectory: [] },
    { id: "defense", kind: "defense" as const, player: "A" as const, time_seconds: 12 },
  ];
  return project;
}

describe("highlight workspace controls", () => {
  it("keeps scope, statistics, and continuous preview controls compact", () => {
    const project = highlightedProject();
    const html = renderToStaticMarkup(<HighlightModeControls
      project={project}
      scope="A"
      view={buildHighlightView(project, "A")}
      previewing={false}
      onScopeChange={vi.fn()}
      onCommand={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
    />);

    expect(html).toContain("高光范围");
    expect(html).toContain("1/2 · 50.0%");
    expect(html).toContain("连续预览");
  });

  it("renders one local dual-handle editor for the selected segment", () => {
    const project = highlightedProject();
    const view = buildHighlightView(project, "A");
    const html = renderToStaticMarkup(<HighlightTrimBar
      project={project}
      view={view}
      segmentIndex={0}
      currentTime={10}
      previewing={false}
      onCommand={vi.fn()}
      onSelect={vi.fn()}
      onPlay={vi.fn()}
    />);

    expect(html).toContain("高光片段 1 / 1");
    expect(html).toContain("拖动左、右手柄调整当前片段");
    expect(html.match(/type="range"/g)).toHaveLength(2);
  });

  it("shows all highlight ranges and event markers on the full-video overview", () => {
    const project = highlightedProject();
    const view = buildHighlightView(project, "A");
    const html = renderToStaticMarkup(<HighlightOverviewTimeline
      project={project}
      view={view}
      segmentIndex={0}
      currentTime={10}
      onSelect={vi.fn()}
    />);

    expect(html).toContain("高光整体视图");
    expect(html).toContain("完整视频中的所有保留区间和事件点");
    expect(html).toContain("选择高光片段 1");
    expect(html).toContain(">+2<");
    expect(html).toContain(">D<");
  });

  it("limits the editing scale to five seconds around the default clip", () => {
    expect(highlightTrimBounds({
      record_ids: ["made"],
      start_seconds: 5,
      end_seconds: 13,
      default_start_seconds: 5,
      default_end_seconds: 13,
    }, 40)).toEqual({ start: 0, end: 18 });
  });
});
