import type { Rect } from "./annotation-project";

export type Point = { x: number; y: number };

export function frameStep(currentTime: number, frames: number, fps: number, duration: number): number {
  const safeFps = fps > 0 ? fps : 30;
  return clamp(currentTime + frames / safeFps, 0, Math.max(0, duration));
}

export function pointerToVideoPoint(
  client: Point,
  surface: { left: number; top: number; width: number; height: number },
  video: { width: number; height: number },
): Point {
  return {
    x: Math.round(clamp((client.x - surface.left) / surface.width, 0, 1) * video.width),
    y: Math.round(clamp((client.y - surface.top) / surface.height, 0, 1) * video.height),
  };
}

export function rectFromPoints(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    x2: Math.max(start.x, end.x),
    y2: Math.max(start.y, end.y),
  };
}

export function rectStyle(rect: Rect, video: { width: number; height: number }) {
  return {
    left: `${(rect.x / video.width) * 100}%`,
    top: `${(rect.y / video.height) * 100}%`,
    width: `${((rect.x2 - rect.x) / video.width) * 100}%`,
    height: `${((rect.y2 - rect.y) / video.height) * 100}%`,
  };
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
