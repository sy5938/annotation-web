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
});
