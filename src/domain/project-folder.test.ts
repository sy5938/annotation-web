import { describe, expect, it } from "vitest";
import { findMatchingVideoFile, listProjectFiles, type FolderFile } from "./project-folder";

function file(name: string, path: string, type = ""): FolderFile {
  return { name, webkitRelativePath: path, type };
}

describe("project folder import", () => {
  it("prefers the exported annotation project filename", () => {
    const project = file("game-annotation-project.json", "session/game-annotation-project.json", "application/json");
    expect(listProjectFiles([file("notes.json", "session/notes.json"), project])).toEqual([project]);
  });

  it("accepts one ordinary JSON file when no exported filename exists", () => {
    const project = file("legacy.json", "session/legacy.json", "application/json");
    expect(listProjectFiles([project, file("game.mp4", "session/game.mp4", "video/mp4")])).toEqual([project]);
  });

  it("lists multiple exported projects for the user to choose", () => {
    const one = file("one-annotation-project.json", "projects/one-annotation-project.json");
    const two = file("two-annotation-project.json", "projects/two-annotation-project.json");
    expect(listProjectFiles([one, two])).toEqual([one, two]);
    expect(listProjectFiles([file("game.mp4", "videos/game.mp4")])).toEqual([]);
  });

  it("matches the exact source video name across workspace subdirectories", () => {
    const project = file("game-annotation-project.json", "workspace/projects/game-annotation-project.json");
    const video = file("game.mp4", "workspace/videos/game.mp4", "video/mp4");

    expect(findMatchingVideoFile([project, video], project, "game.mp4")).toBe(video);
  });

  it("rejects ambiguous videos with the same expected filename", () => {
    const project = file("game-annotation-project.json", "workspace/projects/game-annotation-project.json");
    expect(() => findMatchingVideoFile([
      file("game.mp4", "workspace/videos/game.mp4", "video/mp4"),
      file("game.mp4", "workspace/archive/game.mp4", "video/mp4"),
    ], project, "game.mp4")).toThrow("找到多个同名视频");
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
