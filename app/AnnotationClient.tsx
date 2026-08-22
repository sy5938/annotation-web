"use client";

import { ChangeEvent, useRef, useState } from "react";

type Phase = "approach" | "rim" | "below";
type Coordinate = { x: number; y: number };
type BallBox = Coordinate & { x2: number; y2: number; time_seconds: number; phase: Phase };

const phaseLabels: Record<Phase, string> = {
  approach: "① 接近篮筐",
  rim: "② 经过篮筐",
  below: "③ 篮下离开",
};

export default function AnnotationClient() {
  const video = useRef<HTMLVideoElement>(null);
  const [videoSource, setVideoSource] = useState("/preview-1080.mp4");
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [rim, setRim] = useState<number[] | null>(null);
  const [boxes, setBoxes] = useState<BallBox[]>([]);
  const [mode, setMode] = useState<"rim" | "ball">("rim");
  const [phase, setPhase] = useState<Phase>("approach");
  const [start, setStart] = useState<Coordinate | null>(null);

  function position(event: React.PointerEvent<HTMLDivElement>): Coordinate {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - box.left) * dimensions.width) / box.width),
      y: Math.round(((event.clientY - box.top) * dimensions.height) / box.height),
    };
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoSource(URL.createObjectURL(file));
    setRim(null);
    setBoxes([]);
  }

  function save() {
    const basketball_points = boxes.map((box) => ({
      time_seconds: box.time_seconds,
      x: Math.round((box.x + box.x2) / 2),
      y: Math.round((box.y + box.y2) / 2),
    }));
    const content = JSON.stringify({ rim_roi: rim, basketball_boxes: boxes, basketball_points }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "basketball-annotations.json" });
    link.click();
    URL.revokeObjectURL(url);
  }

  function styleFor(box: { x: number; y: number; x2: number; y2: number }) {
    return {
      left: `${(box.x / dimensions.width) * 100}%`,
      top: `${(box.y / dimensions.height) * 100}%`,
      width: `${((box.x2 - box.x) / dimensions.width) * 100}%`,
      height: `${((box.y2 - box.y) / dimensions.height) * 100}%`,
    };
  }

  return (
    <main>
      <p className="eyebrow">篮球高光 · 困难样本标注</p>
      <h1>每次投篮，标 3 个篮球框</h1>
      <p>暂停视频后，用“接近 → 经过 → 篮下”各标一次。只框篮球本体，框越紧越好。</p>
      <div className="toolbar">
        <label className="file-picker">选择本机 1080P 视频<input type="file" accept="video/*" onChange={selectVideo} /></label>
        <button className={mode === "rim" ? "selected" : ""} onClick={() => setMode("rim")}>框选篮筐</button>
        <button className={mode === "ball" ? "selected" : ""} onClick={() => setMode("ball")}>框选篮球</button>
      </div>
      {mode === "ball" && <div className="phases">{(Object.keys(phaseLabels) as Phase[]).map((item) => <button className={phase === item ? "selected" : ""} key={item} onClick={() => setPhase(item)}>{phaseLabels[item]}</button>)}</div>}
      <section>
        <div
          className="video"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setStart(position(event)); }}
          onPointerUp={(event) => {
            if (!start) return;
            const end = position(event);
            const box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), x2: Math.max(start.x, end.x), y2: Math.max(start.y, end.y) };
            if (box.x2 - box.x < 3 || box.y2 - box.y < 3) return;
            if (mode === "rim") setRim([box.x, box.y, box.x2, box.y2]);
            else if (video.current) setBoxes([...boxes, { ...box, phase, time_seconds: Number(video.current.currentTime.toFixed(2)) }]);
            setStart(null);
          }}
        >
          <video ref={video} controls src={videoSource} onLoadedMetadata={() => video.current && setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight })} />
          {rim && <div className="rim" style={styleFor({ x: rim[0], y: rim[1], x2: rim[2], y2: rim[3] })} />}
          {boxes.map((box, index) => <div className="ball" key={`${box.time_seconds}-${index}`} style={styleFor(box)}><span>{box.phase}</span></div>)}
        </div>
        <aside>
          <h2>这次怎么标</h2>
          <ol><li>切到“框选篮筐”，只框一次。</li><li>切到“框选篮球”，暂停在球清晰时。</li><li>每次投篮各标 3 帧：上方、篮筐、下方。</li></ol>
          <p>篮筐：{rim ? "已标" : "未标"}</p><p>篮球框：{boxes.length}</p>
          <button onClick={() => setBoxes(boxes.slice(0, -1))} disabled={!boxes.length}>撤销上一个篮球框</button>
          <button onClick={save} disabled={!rim || !boxes.length}>下载标注 JSON</button>
        </aside>
      </section>
    </main>
  );
}
