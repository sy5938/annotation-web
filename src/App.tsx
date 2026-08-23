import { ChangeEvent, PointerEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  createAnnotationProject,
  parseAnnotationProject,
  projectFileName,
  projectReducer,
  recordTime,
  scoreFor,
  serializeAnnotationProject,
  type AnnotationRecord,
  type Keyframe,
  type Phase,
  type PlayerId,
  type ShotOutcome,
  type ShotRecord,
} from "./domain/annotation-project";
import {
  formatTime,
  frameStep,
  pointerToVideoPoint,
  rectFromPoints,
  rectStyle,
  type Point,
} from "./domain/video-geometry";

type DrawMode = "idle" | "hoop" | "keyframe";

const phaseLabels: Record<Phase, string> = {
  approach: "接近篮筐",
  rim: "经过篮筐",
  below: "篮下离开",
};

const outcomeLabels: Record<ShotOutcome, string> = {
  made_2: "进 2 分",
  made_3: "进 3 分",
  missed: "未进",
  unreviewed: "待确认",
};

const speeds = [0.25, 0.5, 1, 1.5, 2];

export default function App() {
  const [project, dispatch] = useReducer(projectReducer, undefined, () => createAnnotationProject());
  const [videoUrl, setVideoUrl] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("idle");
  const [drawPhase, setDrawPhase] = useState<Phase>("approach");
  const [replaceKeyframeId, setReplaceKeyframeId] = useState<string | null>(null);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [draftRect, setDraftRect] = useState<ReturnType<typeof rectFromPoints> | null>(null);
  const [notice, setNotice] = useState("打开视频，或导入已有标定工程继续工作。");
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef("");

  const records = useMemo(
    () => [...project.records].sort((a, b) => recordTime(a) - recordTime(b)),
    [project.records],
  );
  const selectedRecord = project.records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedShot = selectedRecord?.kind === "shot" ? selectedRecord : null;
  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  function openVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
    setCurrentTime(0);
    const mismatch = project.source_video.name && project.source_video.name !== file.name;
    dispatch({ type: "set_video", video: { name: file.name } });
    setNotice(mismatch ? `工程记录的视频是“${project.source_video.name}”，当前选择了“${file.name}”，请确认是否匹配。` : `已打开 ${file.name}`);
    event.target.value = "";
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseAnnotationProject(JSON.parse(await file.text()) as unknown);
      dispatch({ type: "replace", project: parsed.project });
      const first = [...parsed.project.records].sort((a, b) => recordTime(a) - recordTime(b))[0];
      setSelectedRecordId(first?.id ?? null);
      setSelectedKeyframeId(first?.kind === "shot" ? first.trajectory[0]?.id ?? null : null);
      setNotice(parsed.migratedFromLegacy ? "旧版标注已迁移到新版工程，请选择对应视频后检查记录。" : "工程已导入，请选择对应视频继续回看。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工程导入失败。");
    }
    event.target.value = "";
  }

  function exportProject() {
    const blob = new Blob([serializeAnnotationProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: projectFileName(project) });
    link.click();
    URL.revokeObjectURL(url);
    setNotice("工程 JSON 已导出到本机下载目录。");
  }

  function addShot(player: PlayerId, outcome: ShotOutcome) {
    const record: ShotRecord = {
      id: crypto.randomUUID(),
      kind: "shot",
      player,
      result_time_seconds: roundTime(currentTime),
      outcome,
      trajectory: [],
    };
    dispatch({ type: "add_record", record });
    setSelectedRecordId(record.id);
    setSelectedKeyframeId(null);
  }

  function addDefense(player: PlayerId) {
    const record: AnnotationRecord = {
      id: crypto.randomUUID(),
      kind: "defense",
      player,
      time_seconds: roundTime(currentTime),
    };
    dispatch({ type: "add_record", record });
    setSelectedRecordId(record.id);
    setSelectedKeyframeId(null);
  }

  function stepFrames(frames: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    seek(frameStep(video.currentTime, frames, project.source_video.fps, video.duration || project.source_video.duration_seconds));
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (video) video.currentTime = time;
    setCurrentTime(time);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function setSpeed(speed: number) {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }

  function changeSpeed(direction: number) {
    const index = speeds.indexOf(playbackRate);
    setSpeed(speeds[Math.max(0, Math.min(speeds.length - 1, index + direction))]);
  }

  function selectRecord(record: AnnotationRecord) {
    setSelectedRecordId(record.id);
    const first = record.kind === "shot" ? record.trajectory[0] : null;
    setSelectedKeyframeId(first?.id ?? null);
    seek(first?.time_seconds ?? recordTime(record));
  }

  function navigateRecord(direction: number) {
    if (!records.length) return;
    const currentIndex = Math.max(0, records.findIndex((record) => record.id === selectedRecordId));
    selectRecord(records[Math.max(0, Math.min(records.length - 1, currentIndex + direction))]);
  }

  function selectKeyframe(keyframe: Keyframe) {
    setSelectedKeyframeId(keyframe.id);
    seek(keyframe.time_seconds);
  }

  function navigateKeyframe(direction: number) {
    if (!selectedShot?.trajectory.length) return;
    const index = Math.max(0, selectedShot.trajectory.findIndex((frame) => frame.id === selectedKeyframeId));
    selectKeyframe(selectedShot.trajectory[Math.max(0, Math.min(selectedShot.trajectory.length - 1, index + direction))]);
  }

  function beginKeyframeDraw(phase: Phase, keyframeId: string | null = null) {
    if (!selectedShot) {
      setNotice("请先选择或新建一条投篮记录，再添加关键帧。");
      return;
    }
    videoRef.current?.pause();
    setDrawPhase(phase);
    setReplaceKeyframeId(keyframeId);
    setDrawMode("keyframe");
  }

  function drawingPoint(event: PointerEvent<HTMLDivElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return pointerToVideoPoint(
      { x: event.clientX, y: event.clientY },
      bounds,
      { width: project.source_video.width, height: project.source_video.height },
    );
  }

  function finishDrawing(event: PointerEvent<HTMLDivElement>) {
    if (!drawStart) return;
    const rect = rectFromPoints(drawStart, drawingPoint(event));
    if (rect.x2 - rect.x < 3 || rect.y2 - rect.y < 3) return cancelDrawing();
    if (drawMode === "hoop") {
      dispatch({ type: "set_hoop", hoop: rect });
    } else if (drawMode === "keyframe" && selectedShot) {
      if (replaceKeyframeId) {
        dispatch({
          type: "update_keyframe",
          shotId: selectedShot.id,
          keyframeId: replaceKeyframeId,
          patch: { box: rect, phase: drawPhase, time_seconds: roundTime(currentTime) },
        });
        setSelectedKeyframeId(replaceKeyframeId);
      } else {
        const keyframe: Keyframe = {
          id: crypto.randomUUID(),
          time_seconds: roundTime(currentTime),
          phase: drawPhase,
          box: rect,
        };
        dispatch({ type: "add_keyframe", shotId: selectedShot.id, keyframe });
        setSelectedKeyframeId(keyframe.id);
      }
    }
    cancelDrawing();
  }

  function cancelDrawing() {
    setDrawStart(null);
    setDraftRect(null);
    setReplaceKeyframeId(null);
    setDrawMode("idle");
  }

  function deleteSelectedRecord() {
    if (!selectedRecord) return;
    dispatch({ type: "delete_record", id: selectedRecord.id });
    setSelectedRecordId(null);
    setSelectedKeyframeId(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stepFrames((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 5 : 1));
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "[") {
        event.preventDefault();
        navigateKeyframe(-1);
      } else if (event.key === "]") {
        event.preventDefault();
        navigateKeyframe(1);
      } else if (event.key === "-" || event.key === "=") {
        event.preventDefault();
        changeSpeed(event.key === "-" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const visibleKeyframes = selectedShot?.trajectory.filter((keyframe) =>
    keyframe.id === selectedKeyframeId || Math.abs(keyframe.time_seconds - currentTime) <= 0.5 / project.source_video.fps,
  ) ?? [];

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">COURTSIDE LABEL · LOCAL</p>
          <h1>篮球视频标定台</h1>
          <p className="intro">工程、视频与标注只在本机处理。用时间轴回看投篮，并直接覆盖需要调整的关键帧。</p>
        </div>
        <div className="local-badge" role="status"><span className="status-dot" /><span><strong>本地工作模式</strong><small>不会上传视频或工程</small></span></div>
      </header>

      <div className="project-bar">
        <label className="file-button primary">打开视频<input type="file" accept="video/*" onChange={openVideo} /></label>
        <label className="file-button">导入工程<input type="file" accept="application/json,.json" onChange={importProject} /></label>
        <button onClick={exportProject}>导出工程</button>
        <span className="project-name">{project.source_video.name || "尚未选择视频"}</span>
        <span className="notice">{notice}</span>
      </div>

      <section className="workspace">
        <aside className="panel records-panel">
          <div className="panel-heading"><span>01</span><h2>投篮记录</h2><b>{records.length}</b></div>
          <div className="scoreboard">
            {(["A", "B"] as PlayerId[]).map((player) => <div key={player}>
              <input aria-label={`${player} 球员名称`} value={project.players[player]} onChange={(event) => dispatch({ type: "set_player_name", player, name: event.target.value })} />
              <strong>{scoreFor(project, player)}</strong>
            </div>)}
          </div>
          <div className="quick-actions">
            {(["A", "B"] as PlayerId[]).map((player) => <div key={player}>
              <span>{project.players[player] || player}</span>
              <button onClick={() => addShot(player, "made_2")}>+2</button>
              <button onClick={() => addShot(player, "made_3")}>+3</button>
              <button onClick={() => addShot(player, "missed")}>未进</button>
              <button onClick={() => addDefense(player)}>好防守</button>
            </div>)}
          </div>
          <div className="record-list">
            {records.map((record, index) => <button className={record.id === selectedRecordId ? "record selected" : "record"} key={record.id} onClick={() => selectRecord(record)}>
              <span className="record-index">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{project.players[record.player] || record.player}</strong><small>{record.kind === "shot" ? outcomeLabels[record.outcome] : "好防守"} · {formatTime(recordTime(record))}</small></span>
              {record.kind === "shot" && <em>{record.trajectory.length} 帧</em>}
            </button>)}
            {!records.length && <p className="empty-state">播放到结果画面后，从上方快速记录第一球。</p>}
          </div>
        </aside>

        <section className="video-column">
          <div className="video-toolbar">
            <button onClick={() => stepFrames(-5)}>−5 帧</button><button onClick={() => stepFrames(-1)}>−1 帧</button>
            <strong>{formatTime(currentTime)}</strong>
            <button onClick={() => stepFrames(1)}>+1 帧</button><button onClick={() => stepFrames(5)}>+5 帧</button>
            <label>倍速<select value={playbackRate} onChange={(event) => setSpeed(Number(event.target.value))}>{speeds.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
            <label>FPS<input type="number" min="1" max="240" value={project.source_video.fps} onChange={(event) => dispatch({ type: "set_video", video: { fps: Math.max(1, Number(event.target.value)) } })} /></label>
          </div>
          <div className="video-shell">
            {videoUrl ? <div className="video-stage" style={{ aspectRatio: `${project.source_video.width} / ${project.source_video.height}` }}>
              {/* Local sports footage may be silent and has no known caption source. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} controls src={videoUrl} onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)} onLoadedMetadata={() => {
                const video = videoRef.current;
                if (!video) return;
                video.playbackRate = playbackRate;
                dispatch({ type: "set_video", video: { width: video.videoWidth, height: video.videoHeight, duration_seconds: video.duration } });
              }} />
              {project.hoop_region && <div className="box hoop-box" style={rectStyle(project.hoop_region, project.source_video)}><span>篮筐</span></div>}
              {visibleKeyframes.map((keyframe) => <div className={keyframe.id === selectedKeyframeId ? "box ball-box selected" : "box ball-box"} style={rectStyle(keyframe.box, project.source_video)} key={keyframe.id}><span>{phaseLabels[keyframe.phase]}</span></div>)}
              {draftRect && <div className="box draft-box" style={rectStyle(draftRect, project.source_video)} />}
              {drawMode !== "idle" && <div className="drawing-layer" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = drawingPoint(event); setDrawStart(point); setDraftRect({ ...point, x2: point.x, y2: point.y }); }} onPointerMove={(event) => { if (drawStart) setDraftRect(rectFromPoints(drawStart, drawingPoint(event))); }} onPointerUp={finishDrawing} onPointerCancel={cancelDrawing} />}
            </div> : <div className="video-empty"><strong>打开本机视频开始标定</strong><span>导入工程后仍需选择对应视频，浏览器不会读取任意本机路径。</span></div>}
          </div>
          <div className="keyboard-hint"><span>空格 播放/暂停</span><span>← → 逐帧</span><span>Shift + ← → 五帧</span><span>[ ] 切换关键帧</span><span>− + 调整倍速</span></div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading"><span>02</span><h2>记录检查</h2></div>
          <div className="navigator"><button onClick={() => navigateRecord(-1)} disabled={!records.length}>上一条</button><button onClick={() => navigateRecord(1)} disabled={!records.length}>下一条</button></div>
          <div className="hoop-actions"><button className={drawMode === "hoop" ? "active" : ""} onClick={() => { videoRef.current?.pause(); setDrawMode("hoop"); }}>框选篮筐</button><button onClick={() => dispatch({ type: "set_hoop", hoop: null })} disabled={!project.hoop_region}>清除</button></div>
          {selectedRecord ? <div className="inspector-content">
            <label>球员<select value={selectedRecord.player} onChange={(event) => selectedRecord.kind === "shot" ? dispatch({ type: "update_shot", id: selectedRecord.id, patch: { player: event.target.value as PlayerId } }) : dispatch({ type: "update_defense", id: selectedRecord.id, patch: { player: event.target.value as PlayerId } })}><option value="A">{project.players.A}</option><option value="B">{project.players.B}</option></select></label>
            {selectedRecord.kind === "shot" && <>
              <label>投篮结果<select value={selectedRecord.outcome} onChange={(event) => dispatch({ type: "update_shot", id: selectedRecord.id, patch: { outcome: event.target.value as ShotOutcome } })}>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <button onClick={() => dispatch({ type: "update_shot", id: selectedRecord.id, patch: { result_time_seconds: roundTime(currentTime) } })}>将结果时间更新到当前帧</button>
              <div className="phase-actions">{(Object.keys(phaseLabels) as Phase[]).map((phase) => <button key={phase} onClick={() => beginKeyframeDraw(phase)}>+ {phaseLabels[phase]}</button>)}</div>
              <div className="keyframe-list">{selectedRecord.trajectory.map((keyframe, index) => <article className={keyframe.id === selectedKeyframeId ? "keyframe selected" : "keyframe"} key={keyframe.id}>
                <button className="keyframe-main" onClick={() => selectKeyframe(keyframe)}><span>{index + 1}. {phaseLabels[keyframe.phase]}</span><time>{formatTime(keyframe.time_seconds)}</time></button>
                <div><button onClick={() => dispatch({ type: "update_keyframe", shotId: selectedRecord.id, keyframeId: keyframe.id, patch: { time_seconds: roundTime(currentTime) } })}>更新时间</button><button onClick={() => beginKeyframeDraw(keyframe.phase, keyframe.id)}>重画</button><button className="danger" onClick={() => dispatch({ type: "delete_keyframe", shotId: selectedRecord.id, keyframeId: keyframe.id })}>删除</button></div>
              </article>)}</div>
            </>}
            {selectedRecord.kind === "defense" && <button onClick={() => dispatch({ type: "update_defense", id: selectedRecord.id, patch: { time_seconds: roundTime(currentTime) } })}>将时间更新到当前帧</button>}
            <button className="delete-record" onClick={deleteSelectedRecord}>删除整条记录</button>
          </div> : <p className="empty-state">从左侧选择一条记录，或先新增投篮结果。</p>}
        </aside>
      </section>

      <section className="timeline-panel" aria-label="标定时间轴">
        <div className="timeline-heading"><div><strong>标定时间轴</strong><span>{selectedShot ? `${project.players[selectedShot.player]} · ${outcomeLabels[selectedShot.outcome]}` : "点击标记跳转回看"}</span></div><div><button onClick={() => navigateKeyframe(-1)} disabled={!selectedShot?.trajectory.length}>上一个关键帧</button><button onClick={() => navigateKeyframe(1)} disabled={!selectedShot?.trajectory.length}>下一个关键帧</button></div></div>
        <div className="timeline-track">
          <div className="timeline-progress" style={{ width: `${timelinePosition(currentTime, project.source_video.duration_seconds)}%` }} />
          {records.map((record) => <button className={record.id === selectedRecordId ? "timeline-record selected" : "timeline-record"} style={{ left: `${timelinePosition(recordTime(record), project.source_video.duration_seconds)}%` }} key={record.id} title={`${project.players[record.player]} ${formatTime(recordTime(record))}`} onClick={() => selectRecord(record)} />)}
          {selectedShot?.trajectory.map((keyframe) => <button className={keyframe.id === selectedKeyframeId ? `timeline-keyframe ${keyframe.phase} selected` : `timeline-keyframe ${keyframe.phase}`} style={{ left: `${timelinePosition(keyframe.time_seconds, project.source_video.duration_seconds)}%` }} key={keyframe.id} title={`${phaseLabels[keyframe.phase]} ${formatTime(keyframe.time_seconds)}`} onClick={() => selectKeyframe(keyframe)} />)}
        </div>
        <div className="timeline-scale"><span>0:00</span><span>{formatTime(project.source_video.duration_seconds / 2)}</span><span>{formatTime(project.source_video.duration_seconds)}</span></div>
      </section>
    </main>
  );
}

function roundTime(value: number): number {
  return Number(value.toFixed(3));
}

function timelinePosition(time: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;
}
