"use client";

import { ChangeEvent, useRef, useState } from "react";

type Phase = "approach" | "rim" | "below";
type Coordinate = { x: number; y: number };
type BallBox = Coordinate & { x2: number; y2: number; time_seconds: number; phase: Phase };
type Player = "甲" | "乙";
type ShotEvent = { time_seconds: number; event: "made_basket" | "missed_shot"; points?: 2 | 3; scorer: Player };

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
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [completed, setCompleted] = useState<BallBox[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"rim" | "ball">("rim");
  const [phase, setPhase] = useState<Phase>("approach");
  const [start, setStart] = useState<Coordinate | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [scorer, setScorer] = useState<Player>("甲");
  const [videoName, setVideoName] = useState("preview-1080.mp4");
  const [annotationName, setAnnotationName] = useState("preview-1080-annotations.json");
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const allBoxes = [...completed.flat(), ...boxes];

  function position(event: React.PointerEvent<HTMLDivElement>): Coordinate {
    const surface = event.currentTarget.querySelector(".video") ?? event.currentTarget;
    const box = surface.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - box.left) * dimensions.width) / box.width),
      y: Math.round(((event.clientY - box.top) * dimensions.height) / box.height),
    };
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoSource(URL.createObjectURL(file));
    setVideoName(file.name);
    setRim(null);
    setBoxes([]);
    setShowAnnotations(true);
    setPan({ x: 0, y: 0 });
    setCompleted([]);
    setShotEvents([]);
    setAnnotationName(`${file.name.replace(/\.[^/.]+$/, "") || "basketball"}-annotations.json`);
  }

  function save() {
    const basketball_points = allBoxes.map((box) => ({
      time_seconds: box.time_seconds,
      x: Math.round((box.x + box.x2) / 2),
      y: Math.round((box.y + box.y2) / 2),
    }));
    const content = JSON.stringify({
      source_video: videoName,
      rim_roi: rim,
      basketball_boxes: allBoxes,
      basketball_points,
      shot_events: shotEvents,
      made_baskets: shotEvents.filter((shot) => shot.event === "made_basket").map(({ time_seconds }) => ({ time_seconds })),
    }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: annotationName });
    link.click();
    URL.revokeObjectURL(url);
  }

  function stepFrames(frames: number) {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = Math.max(0, video.current.currentTime + frames / 30);
  }

  function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
  }

  function recordShot(event: "made_basket" | "missed_shot", points?: 2 | 3) {
    setShotEvents([...shotEvents, { time_seconds: Number(currentTime.toFixed(2)), event, points, scorer }]);
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
      <p>先快速剪辑：暂停到出手结果附近，记录“未进 / 进 2 分 / 进 3 分”。训练检测时，再用“接近 → 经过 → 篮下”各标一次篮球框。</p>
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
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            if (event.button === 2 && zoom > 1) {
              panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
              return;
            }
            if (event.button === 0) setStart(position(event));
          }}
          onPointerMove={(event) => {
            if (!panStart.current) return;
            setPan({ x: panStart.current.panX + event.clientX - panStart.current.x, y: panStart.current.panY + event.clientY - panStart.current.y });
          }}
          onPointerUp={(event) => {
            if (panStart.current) { panStart.current = null; return; }
            if (!start) return;
            const end = position(event);
            const box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), x2: Math.max(start.x, end.x), y2: Math.max(start.y, end.y) };
            if (box.x2 - box.x < 3 || box.y2 - box.y < 3) return;
            if (mode === "rim") setRim([box.x, box.y, box.x2, box.y2]);
            else if (video.current) setBoxes([...boxes, { ...box, phase, time_seconds: Number(video.current.currentTime.toFixed(2)) }]);
            setStart(null);
          }}
          onPointerCancel={() => { panStart.current = null; setStart(null); }}
        >
          <div className="video" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top left", cursor: zoom > 1 ? "grab" : "crosshair" }}>
          <video ref={video} controls src={videoSource} onTimeUpdate={() => video.current && setCurrentTime(video.current.currentTime)} onLoadedMetadata={() => video.current && setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight })} />
          {showAnnotations && rim && <div className="rim" style={styleFor({ x: rim[0], y: rim[1], x2: rim[2], y2: rim[3] })} />}
          {showAnnotations && allBoxes.map((box, index) => <div className="ball" key={`${box.time_seconds}-${index}`} style={styleFor(box)}><span>{box.phase}</span></div>)}
          </div>
        </div>
        <aside>
          <h2>本次标注</h2>
          <p className="current-time">当前时间 <strong>{formatTime(currentTime)}</strong></p>
          <div className="scorer-picker"><button className={scorer === "甲" ? "selected" : ""} onClick={() => setScorer("甲")}>甲 · 第一人</button><button className={scorer === "乙" ? "selected" : ""} onClick={() => setScorer("乙")}>乙 · 第二人</button></div>
          <button onClick={() => recordShot("made_basket", 2)}>记录 {scorer} 进 2 分</button>
          <button onClick={() => recordShot("made_basket", 3)}>记录 {scorer} 进 3 分</button>
          <button onClick={() => recordShot("missed_shot")}>记录 {scorer} 未进球</button>
          <button onClick={() => setShotEvents(shotEvents.slice(0, -1))} disabled={!shotEvents.length}>撤销上一个结果</button>
          <button onClick={() => setShowAnnotations(!showAnnotations)} disabled={!rim && !allBoxes.length}>{showAnnotations ? "隐藏全部标记框" : "显示全部标记框"}</button>
          <button onClick={() => setBoxes(boxes.slice(0, -1))} disabled={!boxes.length}>撤销当前框</button>
          <button onClick={() => { if (boxes.length) { setCompleted([...completed, boxes]); setBoxes([]); setStart(null); } }} disabled={!boxes.length}>完成本次进球并清屏</button>
          <button onClick={() => { setBoxes([]); setStart(null); }} disabled={!boxes.length}>清除当前临时框</button>
          <button onClick={save} disabled={!shotEvents.length && !rim && !boxes.length && !completed.length}>下载全部标注 JSON</button>
          <h3>已记录</h3>
          <ul className="event-list">{shotEvents.map((shot, index) => <li key={`${shot.time_seconds}-${index}`}><time>{formatTime(shot.time_seconds)}</time><span>{shot.scorer} · {shot.event === "made_basket" ? `进 ${shot.points} 分` : "未进"}</span></li>)}</ul>
          <details><summary>标注说明</summary><p>剪辑只记录结果即可。训练检测时，框一次篮筐，再各框 3 个篮球帧。放大后按住鼠标右键可拖动画面。</p><p>标注文件：{annotationName}</p></details>
        </aside>
      </section>
    </main>
  );
}
