import { describe, expect, it } from "vitest";
import { findMatchingVideoFile, selectProjectFile, type FolderFile } from "./project-folder";

function file(name: string, path: string, type = ""): FolderFile {
  return { name, webkitRelativePath: path, type };
}

describe("project folder import", () => {
  it("prefers the exported annotation project filename", () => {
    const project = file("game-annotation-project.json", "session/game-annotation-project.json", "application/json");
    expect(selectProjectFile([file("notes.json", "session/notes.json"), project])).toBe(project);
  });

  it("accepts one ordinary JSON file when no exported filename exists", () => {
    const project = file("legacy.json", "session/legacy.json", "application/json");
    expect(selectProjectFile([project, file("game.mp4", "session/game.mp4", "video/mp4")])).toBe(project);
  });

  it("rejects missing or ambiguous project files", () => {
    expect(() => selectProjectFile([file("game.mp4", "session/game.mp4")])).toThrow("没有找到标定工程 JSON");
    expect(() => selectProjectFile([
      file("one-annotation-project.json", "session/one-annotation-project.json"),
      file("two-annotation-project.json", "session/two-annotation-project.json"),
    ])).toThrow("找到多个标定工程 JSON");
  });

  it("matches the exact source video name in the project directory only", () => {
    const project = file("game-annotation-project.json", "root/session/game-annotation-project.json");
    const sibling = file("game.mp4", "root/session/game.mp4", "video/mp4");
    const nested = file("game.mp4", "root/session/archive/game.mp4", "video/mp4");

    expect(findMatchingVideoFile([nested, sibling], project, "game.mp4")).toBe(sibling);
  });

  it("falls back to the exported project basename for a video file", () => {
    const project = file("game-annotation-project.json", "session/game-annotation-project.json");
    const video = file("game.mov", "session/game.mov", "video/quicktime");
    expect(findMatchingVideoFile([project, video], project, "missing.mp4")).toBe(video);
  });

  it("returns null rather than matching a similarly named non-video file", () => {
    const project = file("game-annotation-project.json", "session/game-annotation-project.json");
    expect(findMatchingVideoFile([project, file("game.txt", "session/game.txt", "text/plain")], project, "game.mp4"))
      .toBeNull();
  });
});
