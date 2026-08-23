"use client";

import { ChangeEvent, useRef, useState } from "react";

type Phase = "approach" | "rim" | "below";
type Coordinate = { x: number; y: number };
type Selection = Coordinate & { x2: number; y2: number };
type BallBox = Coordinate & { x2: number; y2: number; time_seconds: number; phase: Phase };
type Player = "甲" | "乙";
type ShotEvent = { time_seconds: number; event: "made_basket" | "missed_shot" | "good_defense"; points?: 2 | 3; scorer: Player };

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
  const [playerNames, setPlayerNames] = useState<Record<Player, string>>({ 甲: "甲", 乙: "乙" });
  const [previousScores, setPreviousScores] = useState<Record<Player, number>>({ 甲: 0, 乙: 0 });
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
    setPlayerNames({ 甲: "甲", 乙: "乙" });
    setPreviousScores({ 甲: 0, 乙: 0 });
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
      players: playerNames,
      previous_scores: previousScores,
      total_scores: { 甲: previousScores.甲 + score("甲"), 乙: previousScores.乙 + score("乙") },
      shot_events: shotEvents,
      made_baskets: shotEvents.filter((shot) => shot.event === "made_basket").map(({ time_seconds, points, scorer }) => ({ time_seconds, points, scorer })),
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

  function recordGoodDefense(player: Player) {
    setShotEvents([...shotEvents, { time_seconds: Number(currentTime.toFixed(2)), event: "good_defense", scorer: player }]);
  }

  function toggleSavedBoxes() {
    setShowAnnotations(!showAnnotations);
    setDraft(null);
    setMode("idle");
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
      <header className="app-header">
        <div>
          <p className="eyebrow">COURTSIDE LABEL · 篮球数据工具</p>
          <h1>篮球视频标定台</h1>
          <p className="intro">记录投篮结果，逐帧框选篮筐与篮球。标完一球即可清屏进入下一组。</p>
        </div>
        <div className="local-badge" role="status">
          <span className="status-dot" />
          <span><strong>本地工作模式</strong><small>视频与标注不会上传</small></span>
        </div>
      </header>
      <div className="toolbar" aria-label="标定工具">
        <label className="file-picker">打开本机视频<input type="file" accept="video/*" onChange={selectVideo} /></label>
        <span className="video-name" title={videoName}>{videoName}</span>
        <button className={mode === "rim" ? "selected" : ""} aria-pressed={mode === "rim"} onClick={() => { video.current?.pause(); setShowAnnotations(true); setMode("rim"); }} disabled={rimLocked}>框选篮筐</button>
        <button className={mode === "ball" ? "selected" : ""} aria-pressed={mode === "ball"} onClick={() => { video.current?.pause(); setShowAnnotations(true); setMode("ball"); }}>框选篮球</button>
      </div>
      <div className="timeline-controls" aria-label="逐帧控制">
        <button onClick={() => stepFrames(-5)}>后退 5 帧</button><button onClick={() => stepFrames(-1)}>后退 1 帧</button>
        <strong>{formatTime(currentTime)}</strong>
        <button onClick={() => stepFrames(1)}>前进 1 帧</button><button onClick={() => stepFrames(5)}>前进 5 帧</button>
      </div>
      {mode === "ball" && <div className="phase-selector" aria-label="篮球运动阶段">{(Object.keys(phaseLabels) as Phase[]).map((item) => <button className={phase === item ? "selected" : ""} aria-pressed={phase === item} key={item} onClick={() => setPhase(item)}>{phaseLabels[item]}</button>)}</div>}
      <section className="workspace">
        <aside className="panel score-panel">
          <div className="panel-heading"><span>01</span><h2>比赛记录</h2></div>
          <p className="current-time">当前时间 <strong>{formatTime(currentTime)}</strong></p>
          <div className="score-grid">
            <div className="player-column"><strong>甲 · 第一人</strong><input aria-label="甲的名字" value={playerNames.甲} onChange={(event) => setPlayerNames({ ...playerNames, 甲: event.target.value })} /></div>
            <div className="player-column"><strong>乙 · 第二人</strong><input aria-label="乙的名字" value={playerNames.乙} onChange={(event) => setPlayerNames({ ...playerNames, 乙: event.target.value })} /></div>
            <button onClick={() => recordShot("甲", "made_basket", 2)}>{playerNames.甲 || "甲"} +2</button><button onClick={() => recordShot("乙", "made_basket", 2)}>{playerNames.乙 || "乙"} +2</button>
            <button onClick={() => recordShot("甲", "made_basket", 3)}>{playerNames.甲 || "甲"} +3</button><button onClick={() => recordShot("乙", "made_basket", 3)}>{playerNames.乙 || "乙"} +3</button>
            <button onClick={() => recordShot("甲", "missed_shot")}>{playerNames.甲 || "甲"} 未进</button><button onClick={() => recordShot("乙", "missed_shot")}>{playerNames.乙 || "乙"} 未进</button>
            <button className="defense-button" onClick={() => recordGoodDefense("甲")}>甲 好防守</button><button className="defense-button" onClick={() => recordGoodDefense("乙")}>乙 好防守</button>
          </div>
          <button className="undo-score" onClick={() => setShotEvents(shotEvents.slice(0, -1))} disabled={!shotEvents.length}>撤销上一个结果</button>
          <div className="previous-score"><label>上一轮 {playerNames.甲 || "甲"}<input aria-label="甲上一轮得分" type="number" min="0" value={previousScores.甲 || ""} onChange={(event) => setPreviousScores({ ...previousScores, 甲: Math.max(0, Number(event.target.value)) })} /></label><label>{playerNames.乙 || "乙"}<input aria-label="乙上一轮得分" type="number" min="0" value={previousScores.乙 || ""} onChange={(event) => setPreviousScores({ ...previousScores, 乙: Math.max(0, Number(event.target.value)) })} /></label></div>
          <p className="score-total">总分 {playerNames.甲 || "甲"} <strong>{previousScores.甲 + score("甲")}</strong> ： <strong>{previousScores.乙 + score("乙")}</strong> {playerNames.乙 || "乙"}</p>
          <h3>事件时间线 <span>{shotEvents.length}</span></h3>
          {shotEvents.length ? <ul className="event-list">{shotEvents.slice().reverse().map((shot, reverseIndex) => <li key={`${shot.time_seconds}-${shotEvents.length - reverseIndex - 1}`}><time>{formatTime(shot.time_seconds)}</time><span>{playerNames[shot.scorer] || shot.scorer} · {shot.event === "made_basket" ? `进 ${shot.points} 分` : shot.event === "missed_shot" ? "未进" : "好防守"}</span></li>)}</ul> : <p className="empty-state">还没有记录投篮事件</p>}
        </aside>
        <div className="video-shell">
          <div className="canvas-meta"><span>视频画布</span><span>{dimensions.width} × {dimensions.height}</span></div>
          <div className="video" style={{ cursor: mode === "rim" || mode === "ball" ? "crosshair" : "default" }}>
          {/* User-selected annotation footage may be silent and has no known caption source. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={video} controls src={videoSource} onTimeUpdate={() => video.current && setCurrentTime(video.current.currentTime)} onLoadedMetadata={() => video.current && setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight })} />
          {mode !== "idle" && <div className="drawing-layer" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = position(event); setStart(point); setDraft({ ...point, x2: point.x, y2: point.y }); }} onPointerMove={(event) => { if (start) setDraft(selection(start, position(event))); }} onPointerUp={(event) => { if (!start) return; const box = selection(start, position(event)); if (box.x2 - box.x >= 3 && box.y2 - box.y >= 3) { if (mode === "rim") setRim([box.x, box.y, box.x2, box.y2]); else setBoxes([...boxes, { ...box, phase, time_seconds: Number(currentTime.toFixed(2)) }]); } setStart(null); setDraft(null); setMode("idle"); }} onPointerCancel={() => { setStart(null); setDraft(null); setMode("idle"); }} />}
          <div className="saved-boxes" style={{ visibility: showAnnotations ? "visible" : "hidden" }}>
            {rim && <div className="rim" style={styleFor({ x: rim[0], y: rim[1], x2: rim[2], y2: rim[3] })} />}
            {allBoxes.map((box, index) => <div className="ball" key={`${box.time_seconds}-${index}`} style={styleFor(box)}><span>{box.phase}</span></div>)}
          </div>
          {draft && <div className="draft" style={styleFor(draft)} />}
          </div>
        </div>
        <aside className="panel controls-panel">
          <div className="panel-heading"><span>02</span><h2>标定控制</h2></div>
          <p className="current-time">当前时间 <strong>{formatTime(currentTime)}</strong></p>
          <button onClick={() => setRimLocked(true)} disabled={!rim || rimLocked}>{rimLocked ? "篮筐位置已锁定" : "确认并锁定篮筐位置"}</button>
          <button onClick={toggleSavedBoxes} disabled={!rim && !allBoxes.length}>{showAnnotations ? "隐藏已框选的蓝框" : "显示已框选的蓝框"}</button>
          <button onClick={() => setBoxes(boxes.slice(0, -1))} disabled={!boxes.length}>撤销当前框</button>
          <button onClick={() => { if (boxes.length) { setCompleted([...completed, boxes]); setBoxes([]); setStart(null); } }} disabled={!boxes.length}>完成本次进球并清屏</button>
          <button onClick={() => { setBoxes([]); setStart(null); }} disabled={!boxes.length}>清除当前临时框</button>
          <button className="export-button" onClick={save} disabled={!shotEvents.length && !rim && !boxes.length && !completed.length}>导出标注 JSON</button>
          <details><summary>操作说明</summary><p>篮筐只需框一次并锁定。检测训练时，按“接近、经过、篮下”各框一个篮球帧。</p><p className="annotation-file">{annotationName}</p></details>
        </aside>
      </section>
    </main>
  );
}
