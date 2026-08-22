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
  const [completed, setCompleted] = useState<BallBox[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<"rim" | "ball">("rim");
  const [phase, setPhase] = useState<Phase>("approach");
  const [start, setStart] = useState<Coordinate | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [madeBaskets, setMadeBaskets] = useState<number[]>([]);

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
    setCompleted([]);
    setMadeBaskets([]);
  }

  function save() {
    const allBoxes = [...completed.flat(), ...boxes];
    const basketball_points = allBoxes.map((box) => ({
      time_seconds: box.time_seconds,
      x: Math.round((box.x + box.x2) / 2),
      y: Math.round((box.y + box.y2) / 2),
    }));
    const content = JSON.stringify({ rim_roi: rim, basketball_boxes: allBoxes, basketball_points, made_baskets: madeBaskets.map((time_seconds) => ({ time_seconds })) }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "basketball-annotations.json" });
    link.click();
    URL.revokeObjectURL(url);
  }

  function stepFrames(frames: number) {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = Math.max(0, video.current.currentTime + frames / 30);
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
      <p className="eyebrow">篮球高光 · 远程标注工作台</p>
      <h1>一球一组，标完立即清屏</h1>
      <p>想先快速剪辑：暂停到进筐附近并记录进球时间。训练检测时，再用“接近 → 经过 → 篮下”各标一次篮球框。</p>
      <div className="toolbar">
        <label className="file-picker">选择本机 1080P 视频<input type="file" accept="video/*" onChange={selectVideo} /></label>
        <button className={mode === "rim" ? "selected" : ""} onClick={() => setMode("rim")}>框选篮筐</button>
        <button className={mode === "ball" ? "selected" : ""} onClick={() => setMode("ball")}>框选篮球</button>
        <button onClick={() => setZoom(Math.max(1, zoom - 0.25))}>缩小</button>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.25))}>放大 {Math.round(zoom * 100)}%</button>
      </div>
      <div className="phases">
        <button onClick={() => stepFrames(-5)}>后退 5 帧</button><button onClick={() => stepFrames(-1)}>后退 1 帧</button>
        <strong>当前：{currentTime.toFixed(2)} 秒</strong>
        <button onClick={() => stepFrames(1)}>前进 1 帧</button><button onClick={() => stepFrames(5)}>前进 5 帧</button>
      </div>
      {mode === "ball" && <div className="phases">{(Object.keys(phaseLabels) as Phase[]).map((item) => <button className={phase === item ? "selected" : ""} key={item} onClick={() => setPhase(item)}>{phaseLabels[item]}</button>)}</div>}
      <section>
        <div
          className="video-shell"
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
          <div className="video" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          <video ref={video} controls src={videoSource} onTimeUpdate={() => video.current && setCurrentTime(video.current.currentTime)} onLoadedMetadata={() => video.current && setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight })} />
          {rim && <div className="rim" style={styleFor({ x: rim[0], y: rim[1], x2: rim[2], y2: rim[3] })} />}
          {boxes.map((box, index) => <div className="ball" key={`${box.time_seconds}-${index}`} style={styleFor(box)}><span>{box.phase}</span></div>)}
          </div>
        </div>
        <aside>
          <h2>当前工作区</h2>
          <ol><li>快速剪辑：暂停到进筐附近，点“记录此时进球”。</li><li>训练检测：框一次篮筐，再各框 3 个篮球帧。</li><li>最后下载 JSON 发给我。</li></ol>
          <p>篮筐：{rim ? "已标" : "未标"}</p><p>当前框：{boxes.length}</p><p>已完成进球：{completed.length} 组</p><p>进球时间：{madeBaskets.length}</p>
          <button onClick={() => setMadeBaskets([...madeBaskets, Number(currentTime.toFixed(2))])}>记录此时进球</button>
          <button onClick={() => setMadeBaskets(madeBaskets.slice(0, -1))} disabled={!madeBaskets.length}>撤销上一个进球</button>
          <button onClick={() => setBoxes(boxes.slice(0, -1))} disabled={!boxes.length}>撤销当前框</button>
          <button onClick={() => { if (boxes.length) { setCompleted([...completed, boxes]); setBoxes([]); setStart(null); } }} disabled={!boxes.length}>完成本次进球并清屏</button>
          <button onClick={() => { setBoxes([]); setStart(null); }} disabled={!boxes.length}>清除当前临时框</button>
          <button onClick={save} disabled={!rim || (!boxes.length && !completed.length)}>下载全部标注 JSON</button>
        </aside>
      </section>
    </main>
  );
}
