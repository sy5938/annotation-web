"use client";

import { useRef, useState } from "react";

type Point = { time_seconds: number; x: number; y: number };
type Coordinate = { x: number; y: number };

const sourceWidth = 1920;
const sourceHeight = 1440;

export default function AnnotationClient() {
  const video = useRef<HTMLVideoElement>(null);
  const [rim, setRim] = useState<number[] | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [start, setStart] = useState<Coordinate | null>(null);

  function position(event: React.PointerEvent<HTMLDivElement>): Coordinate {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - box.left) * sourceWidth) / box.width),
      y: Math.round(((event.clientY - box.top) * sourceHeight) / box.height),
    };
  }

  function save() {
    const content = JSON.stringify({ rim_roi: rim, basketball_points: points }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "basketball-annotations.json",
    });
    link.click();
    URL.revokeObjectURL(url);
  }

  const rimStyle = rim
    ? {
        left: `${rim[0] / 19.2}%`,
        top: `${rim[1] / 14.4}%`,
        width: `${(rim[2] - rim[0]) / 19.2}%`,
        height: `${(rim[3] - rim[1]) / 14.4}%`,
      }
    : undefined;

  return (
    <main>
      <p className="eyebrow">篮球高光 · 远程标注</p>
      <h1>先框篮筐，再点篮球</h1>
      <p>拖拽框选主篮筐；按住 Shift 点击篮球。下载 JSON 后发给我。</p>
      <section>
        <div
          className="video"
          onPointerDown={(event) => { if (!event.shiftKey) setStart(position(event)); }}
          onPointerUp={(event) => {
            if (!start || event.shiftKey) return;
            const end = position(event);
            setRim([Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(start.x, end.x), Math.max(start.y, end.y)]);
            setStart(null);
          }}
          onClick={(event) => {
            if (!event.shiftKey || !video.current) return;
            const point = position(event);
            setPoints([...points, { time_seconds: Number(video.current.currentTime.toFixed(2)), ...point }]);
          }}
        >
          <video ref={video} controls src="/preview.mp4" />
          {rim && <div className="rim" style={rimStyle} />}
        </div>
        <aside>
          <h2>标注</h2>
          <p>篮筐：{rim ? rim.join(", ") : "未选择"}</p>
          <p>篮球点：{points.length}</p>
          <button onClick={save} disabled={!rim}>下载标注 JSON</button>
        </aside>
      </section>
    </main>
  );
}
