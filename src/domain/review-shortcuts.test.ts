import { describe, expect, it } from "vitest";
import { resolveReviewShortcut } from "./review-shortcuts";

describe("review keyboard shortcuts", () => {
  it("routes Space to playback even when an action button has focus", () => {
    expect(resolveReviewShortcut({ key: " ", shiftKey: false, repeat: false, editable: false }))
      .toEqual({ command: "toggle-playback" });
  });

  it("consumes repeated shortcut events without executing them again", () => {
    expect(resolveReviewShortcut({ key: " ", shiftKey: false, repeat: true, editable: false }))
      .toEqual({ command: "consume" });
    expect(resolveReviewShortcut({ key: "ArrowRight", shiftKey: false, repeat: true, editable: false }))
      .toEqual({ command: "consume" });
  });

  it("keeps editable controls native", () => {
    expect(resolveReviewShortcut({ key: " ", shiftKey: false, repeat: false, editable: true })).toBeNull();
    expect(resolveReviewShortcut({ key: "ArrowLeft", shiftKey: false, repeat: false, editable: true })).toBeNull();
  });

  it("maps arrows to one or five frame steps", () => {
    expect(resolveReviewShortcut({ key: "ArrowLeft", shiftKey: false, repeat: false, editable: false }))
      .toEqual({ command: "step-frames", frames: -1 });
    expect(resolveReviewShortcut({ key: "ArrowRight", shiftKey: true, repeat: false, editable: false }))
      .toEqual({ command: "step-frames", frames: 5 });
  });

  it("maps both player shortcut rows to review events", () => {
    const resolve = (key: string) => resolveReviewShortcut({ key, shiftKey: false, repeat: false, editable: false });

    expect(resolve("z")).toEqual({ command: "record-event", player: "A", event: "made_2" });
    expect(resolve("X")).toEqual({ command: "record-event", player: "A", event: "made_3" });
    expect(resolve("c")).toEqual({ command: "record-event", player: "A", event: "defense" });
    expect(resolve("V")).toEqual({ command: "record-event", player: "A", event: "missed" });
    expect(resolve("a")).toEqual({ command: "record-event", player: "B", event: "made_2" });
    expect(resolve("S")).toEqual({ command: "record-event", player: "B", event: "made_3" });
    expect(resolve("d")).toEqual({ command: "record-event", player: "B", event: "defense" });
    expect(resolve("F")).toEqual({ command: "record-event", player: "B", event: "missed" });
  });

  it("does not repeat or steal editable player event shortcuts", () => {
    expect(resolveReviewShortcut({ key: "z", shiftKey: false, repeat: true, editable: false }))
      .toEqual({ command: "consume" });
    expect(resolveReviewShortcut({ key: "z", shiftKey: false, repeat: false, editable: true })).toBeNull();
  });

  it("routes Command+Z and Ctrl+Z to undo without recording a shot", () => {
    expect(resolveReviewShortcut({ key: "z", shiftKey: false, repeat: false, editable: false, metaKey: true }))
      .toEqual({ command: "undo-record" });
    expect(resolveReviewShortcut({ key: "Z", shiftKey: true, repeat: false, editable: false, ctrlKey: true }))
      .toEqual({ command: "undo-record" });
  });
});
