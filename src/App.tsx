import { ChangeEvent, PointerEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { HighlightPanel } from "./HighlightPanel";
import {
  createAnnotationProject,
  mergeOpenedVideo,
  parseAnnotationProject,
  projectFileName,
  projectReducer,
  recordTime,
  scoreFor,
  serializeAnnotationProject,
  timelineDurationFor,
  type AnnotationRecord,
  type Keyframe,
  type Phase,
  type PlayerId,
  type ShotOutcome,
  type ShotRecord,
} from "./domain/annotation-project";
import {
  buildHighlightView,
  updateHighlightPlan,
  type HighlightPlanCommand,
  type HighlightScope,
} from "./domain/highlight-plan";
import { decideHighlightPlayback } from "./domain/highlight-playback";
import { visibleKeyframesAtTime } from "./domain/keyframe-visibility";
import { findMatchingVideoFile, listProjectFiles } from "./domain/project-folder";
import {
  commitRecordChange,
  emptyRecordHistory,
  redoRecordChange,
  undoRecordChange,
  type RecordChange,
  type RecordHistory,
} from "./domain/record-history";
import { resolveReviewShortcut } from "./domain/review-shortcuts";
import {
  formatTime,
  frameStep,
  pointerToTimelineTime,
  pointerToVideoPoint,
  rectFromPoints,
  rectStyle,
  type Point,
} from "./domain/video-geometry";

type DrawMode = "idle" | "hoop" | "keyframe";
type EventCategory = "made" | "missed" | "defense" | "unreviewed";

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
const eventLegend: Array<{ category: EventCategory; label: string }> = [
  { category: "made", label: "进球" },
  { category: "missed", label: "未进" },
  { category: "defense", label: "好防守" },
  { category: "unreviewed", label: "待确认" },
];

export default function App() {
  const [project, dispatch] = useReducer(projectReducer, undefined, () => createAnnotationProject());
  const [videoUrl, setVideoUrl] = useState("");
  const [openedVideoName, setOpenedVideoName] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showOverlays, setShowOverlays] = useState(true);
  const [visibleEvents, setVisibleEvents] = useState<Record<EventCategory, boolean>>({
    made: true,
    missed: true,
    defense: true,
    unreviewed: true,
  });
  const [trajectoryOpen, setTrajectoryOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("idle");
  const [drawPhase, setDrawPhase] = useState<Phase>("approach");
  const [replaceKeyframeId, setReplaceKeyframeId] = useState<string | null>(null);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [draftRect, setDraftRect] = useState<ReturnType<typeof rectFromPoints> | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<File[]>([]);
  const [workspaceProjects, setWorkspaceProjects] = useState<File[]>([]);
  const [workspaceProjectPath, setWorkspaceProjectPath] = useState("");
  const [recordHistory, setRecordHistory] = useState<RecordHistory>(emptyRecordHistory);
  const [highlightScope, setHighlightScope] = useState<HighlightScope>("all");
  const [highlightPlayback, setHighlightPlayback] = useState({ active: false, segmentIndex: 0 });
  const [notice, setNotice] = useState("打开视频，或导入已有标定工程继续工作。");
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoUrlRef = useRef("");
  const highlightSeekRef = useRef(false);

  const records = useMemo(
    () => [...project.records].sort((a, b) => recordTime(a) - recordTime(b)),
    [project.records],
  );
  const selectedRecord = project.records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedShot = selectedRecord?.kind === "shot" ? selectedRecord : null;
  const selectedKeyframe = selectedShot?.trajectory.find((keyframe) => keyframe.id === selectedKeyframeId) ?? null;
  const timelineDuration = useMemo(() => timelineDurationFor(project), [project]);
  const highlightView = useMemo(
    () => buildHighlightView(project, highlightScope),
    [project, highlightScope],
  );
  const visibleTimelineRecords = useMemo(
    () => records.filter((record) => visibleEvents[eventCategory(record)]),
    [records, visibleEvents],
  );
  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  function attachVideoFile(file: File) {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
    setOpenedVideoName(file.name);
  }

  function openVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    attachVideoFile(file);
    setCurrentTime(0);
    const mismatch = project.source_video.name && project.source_video.name !== file.name;
    dispatch({ type: "set_video", video: { name: file.name } });
    setNotice(mismatch ? `工程记录的视频是“${project.source_video.name}”，当前选择了“${file.name}”，请确认是否匹配。` : `已打开 ${file.name}`);
    event.target.value = "";
  }

  async function loadProjectFile(file: File, folderFiles?: File[]) {
    const parsed = parseAnnotationProject(JSON.parse(await file.text()) as unknown);
    const bundledVideo = folderFiles
      ? findMatchingVideoFile(folderFiles, file, parsed.project.source_video.name)
      : null;
    if (folderFiles && !bundledVideo) {
      const expected = parsed.project.source_video.name || file.name.replace(/-annotation-project\.json$/i, "");
      throw new Error(`已找到工程，但工作文件夹中没有找到对应视频“${expected}”。`);
    }

    let importedProject = parsed.project;
    if (bundledVideo) {
      attachVideoFile(bundledVideo);
      importedProject = { ...parsed.project, source_video: { ...parsed.project.source_video, name: bundledVideo.name } };
    } else {
      const video = videoRef.current;
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        importedProject = mergeOpenedVideo(parsed.project, {
          name: openedVideoName || parsed.project.source_video.name,
          width: video.videoWidth,
          height: video.videoHeight,
          duration_seconds: video.duration,
        });
      }
    }
    dispatch({ type: "replace", project: importedProject });
    setRecordHistory(emptyRecordHistory());
    const first = [...importedProject.records].sort((a, b) => recordTime(a) - recordTime(b))[0];
    const firstTime = first ? recordTime(first) : 0;
    setSelectedRecordId(first?.id ?? null);
    setSelectedKeyframeId(null);
    setTrajectoryOpen(false);
    setShowOverlays(true);
    setHighlightScope("all");
    setHighlightPlayback({ active: false, segmentIndex: 0 });
    if (bundledVideo) setCurrentTime(firstTime);
    else seek(firstTime);

    const expectedName = parsed.project.source_video.name;
    const mismatch = !bundledVideo && openedVideoName && expectedName && openedVideoName !== expectedName;
    const importNotice = bundledVideo
      ? `工程与视频“${bundledVideo.name}”已一起导入，可直接继续复核。`
      : mismatch
        ? `工程记录的视频是“${expectedName}”，当前打开的是“${openedVideoName}”，请确认是否匹配。`
        : parsed.migratedFromLegacy
          ? "旧版标注已迁移；已有画面标记已识别，可直接开始人工复核。"
          : "工程已导入；已有画面标记已识别，可直接开始人工复核。";
    setNotice(parsed.warnings[0] ? `${importNotice} ${parsed.warnings[0]}` : importNotice);
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setWorkspaceFiles([]);
      setWorkspaceProjects([]);
      setWorkspaceProjectPath("");
      await loadProjectFile(file);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工程导入失败。");
    }
    event.target.value = "";
  }

  async function importProjectFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setWorkspaceFiles(files);
    setWorkspaceProjects([]);
    setWorkspaceProjectPath("");
    try {
      const projects = listProjectFiles(files);
      if (!projects.length) throw new Error("所选工作文件夹中没有找到标定工程 JSON。");
      setWorkspaceProjects(projects);
      if (projects.length === 1) {
        setWorkspaceProjectPath(folderFilePath(projects[0]));
        await loadProjectFile(projects[0], files);
      } else {
        setWorkspaceProjectPath("");
        setNotice(`工作文件夹中找到 ${projects.length} 个工程，请选择要打开的工程。`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工程文件夹导入失败。");
    }
    event.target.value = "";
  }

  async function selectWorkspaceProject(event: ChangeEvent<HTMLSelectElement>) {
    const path = event.target.value;
    setWorkspaceProjectPath(path);
    const projectFile = workspaceProjects.find((file) => folderFilePath(file) === path);
    if (!projectFile) return;
    try {
      await loadProjectFile(projectFile, workspaceFiles);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "工作文件夹中的工程打开失败。");
    }
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
    rememberRecordChange({ kind: "add", record, index: project.records.length });
    setSelectedRecordId(record.id);
    setSelectedKeyframeId(null);
    setTrajectoryOpen(false);
  }

  function addDefense(player: PlayerId) {
    const record: AnnotationRecord = {
      id: crypto.randomUUID(),
      kind: "defense",
      player,
      time_seconds: roundTime(currentTime),
    };
    dispatch({ type: "add_record", record });
    rememberRecordChange({ kind: "add", record, index: project.records.length });
    setSelectedRecordId(record.id);
    setSelectedKeyframeId(null);
    setTrajectoryOpen(false);
  }

  function stepFrames(frames: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    seek(frameStep(video.currentTime, frames, project.source_video.fps, video.duration || project.source_video.duration_seconds));
  }

  function seekSeconds(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    seek(Math.max(0, Math.min(video.duration || project.source_video.duration_seconds, video.currentTime + seconds)));
  }

  function seek(time: number) {
    setHighlightPlayback((current) => current.active ? { active: false, segmentIndex: 0 } : current);
    const video = videoRef.current;
    if (video) video.currentTime = time;
    setCurrentTime(time);
  }

  function applyHighlightCommand(command: HighlightPlanCommand) {
    const nextProject = updateHighlightPlan(project, highlightScope, command);
    const nextView = buildHighlightView(nextProject, highlightScope);
    videoRef.current?.pause();
    setHighlightPlayback({ active: false, segmentIndex: 0 });
    dispatch({ type: "replace", project: nextProject });
    if (nextView.segments[0]) seek(nextView.segments[0].start_seconds);
  }

  function changeHighlightScope(scope: HighlightScope) {
    const nextView = buildHighlightView(project, scope);
    videoRef.current?.pause();
    setHighlightScope(scope);
    setHighlightPlayback({ active: false, segmentIndex: 0 });
    if (nextView.segments[0]) seek(nextView.segments[0].start_seconds);
  }

  function startHighlightPreview(segmentIndex: number) {
    const video = videoRef.current;
    const segment = highlightView.segments[segmentIndex];
    if (!video || !segment) return;
    highlightSeekRef.current = true;
    video.currentTime = segment.start_seconds;
    setCurrentTime(segment.start_seconds);
    setHighlightPlayback({ active: true, segmentIndex });
    void video.play();
  }

  function stopHighlightPreview() {
    videoRef.current?.pause();
    setHighlightPlayback({ active: false, segmentIndex: 0 });
  }

  function handleVideoTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (!highlightPlayback.active) return;
    const decision = decideHighlightPlayback(highlightView.segments, highlightPlayback.segmentIndex, video.currentTime);
    if (decision.type === "continue") return;
    if (decision.type === "stop") {
      video.pause();
      setHighlightPlayback({ active: false, segmentIndex: 0 });
      return;
    }
    highlightSeekRef.current = true;
    video.currentTime = decision.start_seconds;
    setCurrentTime(decision.start_seconds);
    setHighlightPlayback({ active: true, segmentIndex: decision.segment_index });
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
    setSelectedKeyframeId(null);
    setTrajectoryOpen(false);
    seek(recordTime(record));
  }

  function navigateRecord(direction: number) {
    if (!records.length) return;
    const currentIndex = Math.max(0, records.findIndex((record) => record.id === selectedRecordId));
    selectRecord(records[Math.max(0, Math.min(records.length - 1, currentIndex + direction))]);
  }

  function selectKeyframe(keyframe: Keyframe) {
    setSelectedKeyframeId(keyframe.id);
    setTrajectoryOpen(true);
    seek(keyframe.time_seconds);
  }

  function navigateKeyframe(direction: number) {
    if (!selectedShot?.trajectory.length) return;
    const index = selectedShot.trajectory.findIndex((frame) => frame.id === selectedKeyframeId);
    const nextIndex = index < 0
      ? (direction < 0 ? selectedShot.trajectory.length - 1 : 0)
      : Math.max(0, Math.min(selectedShot.trajectory.length - 1, index + direction));
    selectKeyframe(selectedShot.trajectory[nextIndex]);
  }

  function nudgeSelectedKeyframe(frames: number) {
    if (!selectedShot || !selectedKeyframe) return;
    const time = frameStep(
      selectedKeyframe.time_seconds,
      frames,
      project.source_video.fps,
      videoRef.current?.duration || project.source_video.duration_seconds || Number.POSITIVE_INFINITY,
    );
    dispatch({
      type: "update_keyframe",
      shotId: selectedShot.id,
      keyframeId: selectedKeyframe.id,
      patch: { time_seconds: roundTime(time) },
    });
    seek(time);
  }

  function moveSelectedKeyframeToCurrentTime() {
    if (!selectedShot || !selectedKeyframe) return;
    dispatch({
      type: "update_keyframe",
      shotId: selectedShot.id,
      keyframeId: selectedKeyframe.id,
      patch: { time_seconds: roundTime(currentTime) },
    });
  }

  function deleteSelectedKeyframe() {
    if (!selectedShot || !selectedKeyframe) return;
    const index = selectedShot.trajectory.findIndex((keyframe) => keyframe.id === selectedKeyframe.id);
    const remaining = selectedShot.trajectory.filter((keyframe) => keyframe.id !== selectedKeyframe.id);
    dispatch({ type: "delete_keyframe", shotId: selectedShot.id, keyframeId: selectedKeyframe.id });
    const next = remaining[Math.min(index, remaining.length - 1)];
    setSelectedKeyframeId(next?.id ?? null);
    if (next) seek(next.time_seconds);
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
    const index = project.records.findIndex((record) => record.id === selectedRecord.id);
    dispatch({ type: "delete_record", id: selectedRecord.id });
    rememberRecordChange({ kind: "delete", record: selectedRecord, index });
    setSelectedRecordId(null);
    setSelectedKeyframeId(null);
    setTrajectoryOpen(false);
  }

  function rememberRecordChange(change: RecordChange) {
    setRecordHistory((history) => commitRecordChange(history, change));
  }

  function undoRecord() {
    const result = undoRecordChange(project.records, recordHistory);
    if (!result) return;
    dispatch({ type: "replace_records", records: result.records });
    setRecordHistory(result.history);
    if (result.change.kind === "delete") {
      setSelectedRecordId(result.change.record.id);
      seek(recordTime(result.change.record));
    } else if (selectedRecordId === result.change.record.id) {
      setSelectedRecordId(null);
      setSelectedKeyframeId(null);
      setTrajectoryOpen(false);
    }
    setNotice(result.change.kind === "add" ? "已撤销新增记录。" : "已恢复刚删除的记录。");
  }

  function redoRecord() {
    const result = redoRecordChange(project.records, recordHistory);
    if (!result) return;
    dispatch({ type: "replace_records", records: result.records });
    setRecordHistory(result.history);
    if (result.change.kind === "add") {
      setSelectedRecordId(result.change.record.id);
      seek(recordTime(result.change.record));
    } else if (selectedRecordId === result.change.record.id) {
      setSelectedRecordId(null);
      setSelectedKeyframeId(null);
      setTrajectoryOpen(false);
    }
    setNotice(result.change.kind === "add" ? "已重做新增记录。" : "已重做删除记录。");
  }

  function timelineTime(clientX: number): number {
    const track = timelineRef.current?.getBoundingClientRect();
    if (!track) return 0;
    return pointerToTimelineTime(clientX, track, timelineDuration);
  }

  function beginTimelineSeek(event: PointerEvent<HTMLDivElement>) {
    if (timelineDuration <= 0) return;
    videoRef.current?.pause();
    setSelectedRecordId(null);
    setSelectedKeyframeId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    seek(timelineTime(event.clientX));
  }

  function continueTimelineSeek(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seek(timelineTime(event.clientX));
  }

  function beginRecordDrag(event: PointerEvent<HTMLButtonElement>, record: AnnotationRecord) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    videoRef.current?.pause();
    selectRecord(record);
  }

  function continueRecordDrag(event: PointerEvent<HTMLButtonElement>, record: AnnotationRecord) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.stopPropagation();
    const time = roundTime(timelineTime(event.clientX));
    if (record.kind === "shot") {
      dispatch({ type: "update_shot", id: record.id, patch: { result_time_seconds: time } });
    } else {
      dispatch({ type: "update_defense", id: record.id, patch: { time_seconds: time } });
    }
    seek(time);
  }

  function beginKeyframeDrag(event: PointerEvent<HTMLButtonElement>, keyframe: Keyframe) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    videoRef.current?.pause();
    selectKeyframe(keyframe);
  }

  function continueKeyframeDrag(event: PointerEvent<HTMLButtonElement>, keyframe: Keyframe) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !selectedShot) return;
    event.stopPropagation();
    const time = roundTime(timelineTime(event.clientX));
    dispatch({ type: "update_keyframe", shotId: selectedShot.id, keyframeId: keyframe.id, patch: { time_seconds: time } });
    seek(time);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const shortcut = resolveReviewShortcut({
        key: event.key,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        editable: Boolean(target?.matches("input, select, textarea, [contenteditable='true']")),
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      });
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut.command === "toggle-playback") togglePlayback();
      if (shortcut.command === "seek-seconds") seekSeconds(shortcut.seconds);
      if (shortcut.command === "navigate-keyframe") navigateKeyframe(shortcut.direction);
      if (shortcut.command === "change-speed") changeSpeed(shortcut.direction);
      if (shortcut.command === "record-event") {
        if (shortcut.event === "defense") addDefense(shortcut.player);
        else addShot(shortcut.player, shortcut.event);
      }
      if (shortcut.command === "undo-record") undoRecord();
      if (shortcut.command === "redo-record") redoRecord();
    }

    function onKeyUp(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === " " && !target?.matches("input, select, textarea, [contenteditable='true']")) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  });

  const visibleKeyframes = visibleKeyframesAtTime(
    selectedShot?.trajectory ?? [],
    selectedKeyframeId,
    currentTime,
    project.source_video.fps,
  );
  const timelineRecordsToRender = selectedRecordId
    ? visibleTimelineRecords.filter((record) => record.id === selectedRecordId)
    : visibleTimelineRecords;

  const timeline = (
    <section className="timeline-panel embedded" aria-label="人工复核时间轴">
      <div className="timeline-heading">
        <div><strong>人工复核时间轴</strong><span>{selectedShot ? `${project.players[selectedShot.player]} · ${outcomeLabels[selectedShot.outcome]}` : "拖动空白定位，拖动事件标签修改时间"}</span></div>
        {trajectoryOpen && <div className="timeline-keyframe-nav"><button onClick={() => navigateKeyframe(-1)} disabled={!selectedShot?.trajectory.length}>上一关键帧</button><button onClick={() => navigateKeyframe(1)} disabled={!selectedShot?.trajectory.length}>下一关键帧</button></div>}
      </div>
      <div className="timeline-meta">
        <div className="event-legend" role="group" aria-label="事件标记显示开关">
          {eventLegend.map(({ category, label }) => <button
            className={`legend-toggle ${category}${visibleEvents[category] ? " active" : ""}`}
            aria-pressed={visibleEvents[category]}
            key={category}
            onClick={() => setVisibleEvents((current) => ({ ...current, [category]: !current[category] }))}
          ><span className="legend-swatch" />{label}</button>)}
        </div>
        <div className="preview-summary" aria-label="预览摘要">
          <div><span>高光时长</span><strong>{highlightView.ready ? formatTime(highlightView.total_seconds) : "—"}</strong></div>
          <div><span>高光片段</span><strong>{highlightView.ready ? `${highlightView.segments.length} 段` : "—"}</strong></div>
        </div>
      </div>
      <div className={timelineDuration > 0 ? "timeline-track" : "timeline-track disabled"} ref={timelineRef} onPointerDown={beginTimelineSeek} onPointerMove={continueTimelineSeek}>
        <div className={highlightView.ready ? "preview-heatmap" : "preview-heatmap waiting"} aria-hidden="true">
          {highlightView.segments.map((segment) => <span
            className="preview-segment"
            style={timelineRangeStyle(segment.start_seconds, segment.end_seconds, project.source_video.duration_seconds)}
            key={`${segment.start_seconds}-${segment.end_seconds}`}
          />)}
        </div>
        <div className="timeline-progress" style={{ width: `${timelinePosition(currentTime, timelineDuration)}%` }} />
        {timelineRecordsToRender.map((record) => {
          const category = eventCategory(record);
          return <button
            className={`timeline-record ${category}${record.id === selectedRecordId ? " selected" : ""}`}
            style={{ left: `${timelinePosition(recordTime(record), timelineDuration)}%` }}
            key={record.id}
            title={`拖动调整：${project.players[record.player]} · ${record.kind === "shot" ? outcomeLabels[record.outcome] : "好防守"} · ${formatTime(recordTime(record))}`}
            onPointerDown={(event) => beginRecordDrag(event, record)}
            onPointerMove={(event) => continueRecordDrag(event, record)}
            onClick={(event) => { if (event.detail === 0) selectRecord(record); }}
          ><span>{eventMarkerLabel(record)}</span></button>;
        })}
        {trajectoryOpen && selectedShot?.trajectory.map((keyframe) => <button className={keyframe.id === selectedKeyframeId ? `timeline-keyframe ${keyframe.phase} selected` : `timeline-keyframe ${keyframe.phase}`} style={{ left: `${timelinePosition(keyframe.time_seconds, timelineDuration)}%` }} key={keyframe.id} title={`拖动调整：${phaseLabels[keyframe.phase]} ${formatTime(keyframe.time_seconds)}`} onPointerDown={(event) => beginKeyframeDrag(event, keyframe)} onPointerMove={(event) => continueKeyframeDrag(event, keyframe)} onClick={(event) => { if (event.detail === 0) selectKeyframe(keyframe); }} />)}
      </div>
      <div className="timeline-scale"><span>0:00</span><span>{formatTime(timelineDuration / 2)}</span><span>{formatTime(timelineDuration)}</span></div>
      {timelineDuration <= 0 && <p className="timeline-empty-hint">请先打开视频，或导入包含时间记录的工程。</p>}
    </section>
  );

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">COURTSIDE LABEL · LOCAL · V0.2 PREVIEW</p>
          <h1>篮球视频标定台</h1>
          <p className="intro">工程、视频与标注只在本机处理。用时间轴回看投篮，并直接覆盖需要调整的关键帧。</p>
        </div>
        <div className="local-badge" role="status"><span className="status-dot" /><span><strong>本地工作模式</strong><small>不会上传视频或工程</small></span></div>
      </header>

      <div className="project-bar">
        <label className="file-button primary">打开视频<input type="file" accept="video/*" onChange={openVideo} /></label>
        <label className="file-button bundle-import">打开工作文件夹<input type="file" multiple onChange={importProjectFolder} ref={(input) => { if (input) input.webkitdirectory = true; }} /></label>
        <label className="file-button">仅导入工程<input type="file" accept="application/json,.json" onChange={importProject} /></label>
        <button onClick={exportProject}>导出工程</button>
        <span className="project-name">{project.source_video.name || "尚未选择视频"}</span>
        <span className="notice">{notice}</span>
        {workspaceProjects.length > 1 && <div className="workspace-project-picker">
          <label>选择工程<select value={workspaceProjectPath} onChange={selectWorkspaceProject}><option value="">请选择…</option>{workspaceProjects.map((file) => <option value={folderFilePath(file)} key={folderFilePath(file)}>{folderFilePath(file)}</option>)}</select></label>
          <span>{workspaceProjects.length} 个工程 · 自动匹配对应视频</span>
        </div>}
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
          <div className="record-history-actions"><button onClick={undoRecord} disabled={!recordHistory.past.length}>撤销 <span>⌘Z</span></button><button onClick={redoRecord} disabled={!recordHistory.future.length}>重做 <span>⇧⌘Z</span></button></div>
        </aside>

        <section className="video-column">
          <div className="review-controls-sticky">
            <div className="video-toolbar">
              <button onClick={() => stepFrames(-5)}>−5 帧</button><button onClick={() => stepFrames(-1)}>−1 帧</button>
              <strong>{formatTime(currentTime)}</strong>
              <button onClick={() => stepFrames(1)}>+1 帧</button><button onClick={() => stepFrames(5)}>+5 帧</button>
              <label>倍速<select value={playbackRate} onChange={(event) => setSpeed(Number(event.target.value))}>{speeds.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
              <label>FPS<input type="number" min="1" max="240" value={project.source_video.fps} onChange={(event) => dispatch({ type: "set_video", video: { fps: Math.max(1, Number(event.target.value)) } })} /></label>
            </div>
            {timeline}
          </div>
          <div className="video-shell">
            {videoUrl ? <div className="video-stage" style={{ aspectRatio: `${project.source_video.width} / ${project.source_video.height}` }}>
              {/* Local sports footage may be silent and has no known caption source. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} controls src={videoUrl} onTimeUpdate={handleVideoTimeUpdate} onSeeking={() => {
                if (!highlightSeekRef.current) setHighlightPlayback({ active: false, segmentIndex: 0 });
              }} onSeeked={() => { highlightSeekRef.current = false; }} onLoadedMetadata={() => {
                const video = videoRef.current;
                if (!video) return;
                video.playbackRate = playbackRate;
                video.currentTime = Math.min(currentTime, video.duration);
                dispatch({ type: "set_video", video: { width: video.videoWidth, height: video.videoHeight, duration_seconds: video.duration } });
              }} />
              {showOverlays && project.hoop_region && <div className="box hoop-box" style={rectStyle(project.hoop_region, project.source_video)}><span>篮筐</span></div>}
              {showOverlays && visibleKeyframes.map((keyframe) => <div className={keyframe.id === selectedKeyframeId ? "box ball-box selected" : "box ball-box"} style={rectStyle(keyframe.box, project.source_video)} key={keyframe.id}><span>{phaseLabels[keyframe.phase]}</span></div>)}
              {draftRect && <div className="box draft-box" style={rectStyle(draftRect, project.source_video)} />}
              {drawMode !== "idle" && <div className="drawing-layer" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = drawingPoint(event); setDrawStart(point); setDraftRect({ ...point, x2: point.x, y2: point.y }); }} onPointerMove={(event) => { if (drawStart) setDraftRect(rectFromPoints(drawStart, drawingPoint(event))); }} onPointerUp={finishDrawing} onPointerCancel={cancelDrawing} />}
            </div> : <div className="video-empty"><strong>打开本机视频开始标定</strong><span>导入工程后仍需选择对应视频，浏览器不会读取任意本机路径。</span></div>}
          </div>
          <div className="overlay-controls" aria-label="画面标记显示设置">
            <button className={showOverlays ? "active" : ""} aria-pressed={showOverlays} onClick={() => setShowOverlays((visible) => !visible)} disabled={!project.hoop_region && !selectedShot?.trajectory.length}>{showOverlays ? "隐藏画面标记" : "显示画面标记"}</button>
          </div>
          <details className="shortcut-guide">
            <summary><span>快捷键说明</span><small>忘记按键时在这里查看</small></summary>
            <div className="shortcut-guide-content">
              <section><strong>快速记录</strong><p><b>{project.players.A || "甲"}</b><span><kbd>Z</kbd> 2 分 · <kbd>X</kbd> 3 分 · <kbd>C</kbd> 好防守 · <kbd>V</kbd> 未进</span></p><p><b>{project.players.B || "乙"}</b><span><kbd>A</kbd> 2 分 · <kbd>S</kbd> 3 分 · <kbd>D</kbd> 好防守 · <kbd>F</kbd> 未进</span></p></section>
              <section><strong>播放与定位</strong><p><span><kbd>空格</kbd> 播放/暂停 · <kbd>←</kbd> 后退 5 秒 · <kbd>→</kbd> 前进 5 秒</span></p><p><span>精确逐帧请使用视频上方的 −5、−1、+1、+5 帧按钮。</span></p></section>
              <section><strong>复核操作</strong><p><span><kbd>[</kbd> / <kbd>]</kbd> 切换关键帧 · <kbd>−</kbd> / <kbd>+</kbd> 调整倍速</span></p><p><span><kbd>⌘/Ctrl + Z</kbd> 撤销 · <kbd>Shift + ⌘/Ctrl + Z</kbd> 重做</span></p></section>
            </div>
          </details>
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
              <section className="optional-trajectory">
                <button className="optional-trajectory-toggle" aria-expanded={trajectoryOpen} onClick={() => setTrajectoryOpen((open) => !open)}>
                  <span><strong>球位置关键帧</strong><small>可选 · 暂不影响投篮记录</small></span>
                  <b>{selectedRecord.trajectory.length} 帧 · {trajectoryOpen ? "收起" : "展开"}</b>
                </button>
                {trajectoryOpen && <div className="trajectory-editor">
                  <div className="phase-actions">{(Object.keys(phaseLabels) as Phase[]).map((phase) => <button key={phase} onClick={() => beginKeyframeDraw(phase)}>+ {phaseLabels[phase]}</button>)}</div>
                  <div className="keyframe-list">{selectedRecord.trajectory.map((keyframe, index) => <button className={keyframe.id === selectedKeyframeId ? "keyframe selected" : "keyframe"} key={keyframe.id} onClick={() => selectKeyframe(keyframe)}>
                    <span><b>{index + 1}</b>{phaseLabels[keyframe.phase]}</span><time>{formatTime(keyframe.time_seconds)}</time>
                  </button>)}</div>
                  {!selectedRecord.trajectory.length && <p className="empty-state">这是可选标注。需要时停到对应画面，再添加球位置关键帧。</p>}
                  {selectedKeyframe && <div className="keyframe-editor">
                    <div className="keyframe-editor-heading"><span><strong>当前关键帧</strong><small>{formatTime(selectedKeyframe.time_seconds)}</small></span><button onClick={() => setSelectedKeyframeId(null)}>取消选择</button></div>
                    <label>阶段<select value={selectedKeyframe.phase} onChange={(event) => dispatch({ type: "update_keyframe", shotId: selectedRecord.id, keyframeId: selectedKeyframe.id, patch: { phase: event.target.value as Phase } })}>{Object.entries(phaseLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <div className="keyframe-nudge"><button onClick={() => nudgeSelectedKeyframe(-1)}>−1 帧</button><button onClick={() => nudgeSelectedKeyframe(1)}>+1 帧</button></div>
                    <button className="primary-action" onClick={moveSelectedKeyframeToCurrentTime}>设为当前播放帧</button>
                    <div className="keyframe-secondary"><button onClick={() => beginKeyframeDraw(selectedKeyframe.phase, selectedKeyframe.id)}>在当前帧重画</button><button className="danger" onClick={deleteSelectedKeyframe}>删除关键帧</button></div>
                  </div>}
                </div>}
              </section>
            </>}
            {selectedRecord.kind === "defense" && <button onClick={() => dispatch({ type: "update_defense", id: selectedRecord.id, patch: { time_seconds: roundTime(currentTime) } })}>将时间更新到当前帧</button>}
            <button className="delete-record" onClick={deleteSelectedRecord}>删除整条记录</button>
          </div> : <p className="empty-state">从左侧选择一条记录，或先新增投篮结果。</p>}
        </aside>
      </section>

      <HighlightPanel
        project={project}
        scope={highlightScope}
        view={highlightView}
        previewing={highlightPlayback.active}
        activeSegmentIndex={highlightPlayback.segmentIndex}
        onScopeChange={changeHighlightScope}
        onCommand={applyHighlightCommand}
        onStart={startHighlightPreview}
        onStop={stopHighlightPreview}
      />

    </main>
  );
}

function folderFilePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

function roundTime(value: number): number {
  return Number(value.toFixed(3));
}

function timelinePosition(time: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;
}

function timelineRangeStyle(start: number, end: number, duration: number) {
  return {
    left: `${timelinePosition(start, duration)}%`,
    width: `${timelinePosition(end, duration) - timelinePosition(start, duration)}%`,
  };
}

function eventCategory(record: AnnotationRecord): EventCategory {
  if (record.kind === "defense") return "defense";
  if (record.outcome === "made_2" || record.outcome === "made_3") return "made";
  return record.outcome === "missed" ? "missed" : "unreviewed";
}

function eventMarkerLabel(record: AnnotationRecord): string {
  if (record.kind === "defense") return "防守";
  if (record.outcome === "made_2") return "+2";
  if (record.outcome === "made_3") return "+3";
  return record.outcome === "missed" ? "未进" : "待定";
}
