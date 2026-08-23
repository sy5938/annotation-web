import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HighlightPanel } from "./HighlightPanel";
import { createAnnotationProject } from "./domain/annotation-project";
import { buildHighlightView } from "./domain/highlight-plan";

describe("Highlight Panel", () => {
  it("renders scope controls, real shooting statistics, event choices, and segment editors", () => {
    const project = createAnnotationProject("game.mp4");
    project.source_video.duration_seconds = 40;
    project.players.A = "小王";
    project.records = [
      { id: "made", kind: "shot", player: "A", outcome: "made_2", result_time_seconds: 10, trajectory: [] },
      { id: "missed", kind: "shot", player: "A", outcome: "missed", result_time_seconds: 20, trajectory: [] },
      { id: "defense", kind: "defense", player: "A", time_seconds: 12 },
    ];
    const html = renderToStaticMarkup(<HighlightPanel
      project={project}
      scope="A"
      view={buildHighlightView(project, "A")}
      previewing={false}
      activeSegmentIndex={0}
      onScopeChange={vi.fn()}
      onCommand={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
    />);

    expect(html).toContain(">03<");
    expect(html).toContain("高光预览");
    expect(html).toContain("1 / 2");
    expect(html).toContain("50.0%");
    expect(html).toContain("Good defense：1 次");
    expect(html).toContain("恢复默认");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('type="range"');
  });
});
