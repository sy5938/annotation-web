export type ReviewShortcut =
  | { command: "toggle-playback" }
  | { command: "step-frames"; frames: number }
  | { command: "navigate-keyframe"; direction: number }
  | { command: "change-speed"; direction: number }
  | { command: "record-event"; player: "A" | "B"; event: "made_2" | "made_3" | "defense" | "missed" }
  | { command: "undo-record" }
  | { command: "redo-record" }
  | { command: "consume" };

type ShortcutInput = {
  key: string;
  shiftKey: boolean;
  repeat: boolean;
  editable: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export function resolveReviewShortcut(input: ShortcutInput): ReviewShortcut | null {
  if (input.editable) return null;

  let shortcut: ReviewShortcut | null = null;
  const key = input.key.toLowerCase();
  const commandModifier = Boolean(input.metaKey || input.ctrlKey);
  if (input.key === " ") shortcut = { command: "toggle-playback" };
  if (input.key === "ArrowLeft") shortcut = { command: "step-frames", frames: input.shiftKey ? -5 : -1 };
  if (input.key === "ArrowRight") shortcut = { command: "step-frames", frames: input.shiftKey ? 5 : 1 };
  if (input.key === "[") shortcut = { command: "navigate-keyframe", direction: -1 };
  if (input.key === "]") shortcut = { command: "navigate-keyframe", direction: 1 };
  if (input.key === "-") shortcut = { command: "change-speed", direction: -1 };
  if (input.key === "=" || input.key === "+") shortcut = { command: "change-speed", direction: 1 };
  if (!commandModifier && !input.altKey) {
    if (key === "z") shortcut = { command: "record-event", player: "A", event: "made_2" };
    if (key === "x") shortcut = { command: "record-event", player: "A", event: "made_3" };
    if (key === "c") shortcut = { command: "record-event", player: "A", event: "defense" };
    if (key === "v") shortcut = { command: "record-event", player: "A", event: "missed" };
    if (key === "a") shortcut = { command: "record-event", player: "B", event: "made_2" };
    if (key === "s") shortcut = { command: "record-event", player: "B", event: "made_3" };
    if (key === "d") shortcut = { command: "record-event", player: "B", event: "defense" };
    if (key === "f") shortcut = { command: "record-event", player: "B", event: "missed" };
  }
  if (commandModifier && key === "z") {
    shortcut = { command: input.shiftKey || (input.metaKey && input.ctrlKey) ? "redo-record" : "undo-record" };
  }

  if (!shortcut) return null;
  return input.repeat ? { command: "consume" } : shortcut;
}
