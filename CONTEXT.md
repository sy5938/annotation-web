# Basketball Video Annotation

This context defines the language used to create, review, and continue manual basketball-video annotations on one local device.

## Language

**Annotation Project（标定工程）**:
A resumable collection for one source video, containing its hoop region and every shot record required for review and export.
_Avoid_: Session, workspace, annotation file

**Shot Record（投篮记录）**:
The reviewable unit for one player’s shot, combining its result, timestamp, and basketball trajectory.
_Avoid_: Shot event, score event, completed group

**Bad Defense（防守不好）**:
A timestamped review event indicating a defensive breakdown, separate from a shot result.
_Avoid_: Good defense, defensive highlight

**Basketball Trajectory（篮球轨迹）**:
The ordered basketball boxes associated with one shot record, labelled by their approach, rim, or below-rim phase.
_Avoid_: Completed boxes, point list

**Keyframe（关键帧）**:
One timestamped basketball box within a basketball trajectory, editable by seeking to another video frame or redrawing its rectangle.
_Avoid_: Saved box, annotation point

**Annotation Timeline（标定时间轴）**:
The chronological view of shot records and their keyframes used to navigate and review an annotation project.
_Avoid_: Event list, history

**Preview Window（预览区间）**:
A candidate time range surrounding one shot record before overlaps are resolved.
_Avoid_: Export clip, saved segment

**Preview Segment（预览片段）**:
A continuous preview range produced by combining overlapping or touching preview windows.
_Avoid_: Rendered clip, output video

**Preview Summary（预览摘要）**:
The projected total duration and segment count of the preview segments.
_Avoid_: Export result, render statistics

**Hoop Region（篮筐区域）**:
The source video’s reusable rectangular hoop annotation, shared by every shot record in an annotation project.
_Avoid_: Rim ROI, rim box
