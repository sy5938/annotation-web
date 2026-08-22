"use client";

import { ChangeEvent, useRef, useState } from "react";

type Phase = "approach" | "rim" | "below";
type Coordinate = { x: number; y: number };
type Selection = Coordinate & { x2: number; y2: number };
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
  const [rimLocked, setRimLocked] = useState(false);
  const [boxes, setBoxes] = useState<BallBox[]>([]);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [completed, setCompleted] = useState<BallBox[][]>([]);
  const [mode, setMode] = useState<"idle" | "rim" | "ball">("idle");
  const [phase, setPhase] = useState<Phase>("approach");
  const [start, setStart] = useState<Coordinate | null>(null);
  const [draft, setDraft] = useState<Selection | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [videoName, setVideoName] = useState("preview-1080.mp4");
  const [annotationName, setAnnotationName] = useState("preview-1080-annotations.json");
  const allBoxes = [...completed.flat(), ...boxes];
  const score = (player: Player) => shotEvents.filter((shot) => shot.scorer === player).reduce((total, shot) => total + (shot.points ?? 0), 0);

  function position(event: React.PointerEvent<HTMLDivElement>): Coordinate {
    const surface = event.currentTarget.parentElement ?? event.currentTarget;
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
    setRimLocked(false);
    setMode("idle");
    setBoxes([]);
    setShowAnnotations(true);
    setCompleted([]);
    setShotEvents([]);
    setDraft(null);
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

  function recordShot(scorer: Player, event: "made_basket" | "missed_shot", points?: 2 | 3) {
    setShotEvents([...shotEvents, { time_seconds: Number(currentTime.toFixed(2)), event, points, scorer }]);
  }

  function selection(start: Coordinate, end: Coordinate): Selection {
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), x2: Math.max(start.x, end.x), y2: Math.max(start.y, end.y) };
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
        <button className={mode === "rim" ? "selected" : ""} onClick={() => { video.current?.pause(); setMode("rim"); }} disabled={rimLocked}>开始框选篮筐</button>
        <button className={mode === "ball" ? "selected" : ""} onClick={() => { video.current?.pause(); setMode("ball"); }}>开始框选篮球</button>
      </div>
      <div className="phases">
        <button onClick={() => stepFrames(-5)}>后退 5 帧</button><button onClick={() => stepFrames(-1)}>后退 1 帧</button>
        <strong>当前：{currentTime.toFixed(2)} 秒</strong>
        <button onClick={() => stepFrames(1)}>前进 1 帧</button><button onClick={() => stepFrames(5)}>前进 5 帧</button>
      </div>
      {mode === "ball" && <div className="phases">{(Object.keys(phaseLabels) as Phase[]).map((item) => <button className={phase === item ? "selected" : ""} key={item} onClick={() => setPhase(item)}>{phaseLabels[item]}</button>)}</div>}
      <section>
        <aside className="score-panel">
          <h2>得分记录</h2>
          <p className="current-time">当前时间 <strong>{formatTime(currentTime)}</strong></p>
          <div className="score-grid">
            <strong>甲 · 第一人</strong><strong>乙 · 第二人</strong>
            <button onClick={() => recordShot("甲", "made_basket", 2)}>甲 +2</button><button onClick={() => recordShot("乙", "made_basket", 2)}>乙 +2</button>
            <button onClick={() => recordShot("甲", "made_basket", 3)}>甲 +3</button><button onClick={() => recordShot("乙", "made_basket", 3)}>乙 +3</button>
            <button onClick={() => recordShot("甲", "missed_shot")}>甲 未进</button><button onClick={() => recordShot("乙", "missed_shot")}>乙 未进</button>
          </div>
          <p className="score-total">总分　甲 <strong>{score("甲")}</strong> ： <strong>{score("乙")}</strong> 乙</p>
          <h3>已记录</h3>
          <ul className="event-list">{shotEvents.map((shot, index) => <li key={`${shot.time_seconds}-${index}`}><time>{formatTime(shot.time_seconds)}</time><span>{shot.scorer} · {shot.event === "made_basket" ? `进 ${shot.points} 分` : "未进"}</span></li>)}</ul>
        </aside>
        <div className="video-shell">
          <div className="video" style={{ cursor: mode === "rim" || mode === "ball" ? "crosshair" : "default" }}>
          <video ref={video} controls src={videoSource} onTimeUpdate={() => video.current && setCurrentTime(video.current.currentTime)} onLoadedMetadata={() => video.current && setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight })} />
          {mode !== "idle" && <div className="drawing-layer" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = position(event); setStart(point); setDraft({ ...point, x2: point.x, y2: point.y }); }} onPointerMove={(event) => { if (start) setDraft(selection(start, position(event))); }} onPointerUp={(event) => { if (!start) return; const box = selection(start, position(event)); if (box.x2 - box.x >= 3 && box.y2 - box.y >= 3) { if (mode === "rim") setRim([box.x, box.y, box.x2, box.y2]); else setBoxes([...boxes, { ...box, phase, time_seconds: Number(currentTime.toFixed(2)) }]); } setStart(null); setDraft(null); setMode("idle"); }} onPointerCancel={() => { setStart(null); setDraft(null); setMode("idle"); }} />}
          {showAnnotations && rim && <div className="rim" style={styleFor({ x: rim[0], y: rim[1], x2: rim[2], y2: rim[3] })} />}
          {showAnnotations && allBoxes.map((box, index) => <div className="ball" key={`${box.time_seconds}-${index}`} style={styleFor(box)}><span>{box.phase}</span></div>)}
          {draft && <div className="draft" style={styleFor(draft)} />}
          </div>
        </div>
        <aside className="controls-panel">
          <h2>视频与框选</h2>
          <p className="current-time">当前时间 <strong>{formatTime(currentTime)}</strong></p>
          <button onClick={() => setRimLocked(true)} disabled={!rim || rimLocked}>{rimLocked ? "篮筐位置已锁定" : "确认并锁定篮筐位置"}</button>
          <button onClick={() => setShotEvents(shotEvents.slice(0, -1))} disabled={!shotEvents.length}>撤销上一个结果</button>
          <button onClick={() => setShowAnnotations(!showAnnotations)} disabled={!rim && !allBoxes.length}>{showAnnotations ? "隐藏已框选的框" : "显示已框选的框"}</button>
          <button onClick={() => setBoxes(boxes.slice(0, -1))} disabled={!boxes.length}>撤销当前框</button>
          <button onClick={() => { if (boxes.length) { setCompleted([...completed, boxes]); setBoxes([]); setStart(null); } }} disabled={!boxes.length}>完成本次进球并清屏</button>
          <button onClick={() => { setBoxes([]); setStart(null); }} disabled={!boxes.length}>清除当前临时框</button>
          <button onClick={save} disabled={!shotEvents.length && !rim && !boxes.length && !completed.length}>下载全部标注 JSON</button>
          <details><summary>标注说明</summary><p>剪辑只记录结果即可。篮筐只需框一次，点击确认后会锁定。训练检测时，再各框 3 个篮球帧。</p><p>标注文件：{annotationName}</p></details>
        </aside>
      </section>
    </main>
  );
}
