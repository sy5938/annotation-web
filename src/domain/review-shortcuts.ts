export type ReviewShortcut =
  | { command: "toggle-playback" }
  | { command: "step-frames"; frames: number }
  | { command: "navigate-keyframe"; direction: number }
  | { command: "change-speed"; direction: number }
  | { command: "consume" };

type ShortcutInput = {
  key: string;
  shiftKey: boolean;
  repeat: boolean;
  editable: boolean;
};

export function resolveReviewShortcut(input: ShortcutInput): ReviewShortcut | null {
  if (input.editable) return null;

  let shortcut: ReviewShortcut | null = null;
  if (input.key === " ") shortcut = { command: "toggle-playback" };
  if (input.key === "ArrowLeft") shortcut = { command: "step-frames", frames: input.shiftKey ? -5 : -1 };
  if (input.key === "ArrowRight") shortcut = { command: "step-frames", frames: input.shiftKey ? 5 : 1 };
  if (input.key === "[") shortcut = { command: "navigate-keyframe", direction: -1 };
  if (input.key === "]") shortcut = { command: "navigate-keyframe", direction: 1 };
  if (input.key === "-") shortcut = { command: "change-speed", direction: -1 };
  if (input.key === "=" || input.key === "+") shortcut = { command: "change-speed", direction: 1 };

  if (!shortcut) return null;
  return input.repeat ? { command: "consume" } : shortcut;
}
