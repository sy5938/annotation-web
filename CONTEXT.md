# Basketball Video Annotation

This context defines the language used to create, review, and continue manual basketball-video annotations on one local device.

## Language

**Annotation Project（标定工程）**:
A resumable collection for one source video, containing its hoop region and every shot record required for review and export.
_Avoid_: Session, workspace, annotation file

**Shot Record（投篮记录）**:
The reviewable unit for one player’s shot, combining its result, timestamp, and basketball trajectory.
_Avoid_: Shot event, score event, completed group

**Good Defense（好防守）**:
A timestamped review event highlighting a successful defensive play, separate from a shot result.
_Avoid_: Bad defense, defensive breakdown

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
A continuous preview range that contains every included highlight record within it; overlapping or touching ranges are combined both when generated and after their outer boundaries are manually refined.
_Avoid_: Rendered clip, output video

**Preview Summary（预览摘要）**:
The projected total duration and segment count of the preview segments.
_Avoid_: Export result, render statistics

**Positive Highlight（正向高光）**:
A made shot or an explicitly recorded good defense attributed to a player; missed and unreviewed shots are excluded.
_Avoid_: Every shot, inferred defense

**Personal Highlight Preview（个人高光预览）**:
The chronological preview of positive highlights explicitly attributed to one selected player.
_Avoid_: Annotation mode, inferred player highlights

**Highlight Scope（高光范围）**:
The choice between previewing positive highlights for both players or for one selected player.
_Avoid_: Annotation mode, export scope

**Highlight Playback（高光连续预览）**:
An ordered preview that plays highlight segments continuously while keeping each segment directly selectable.
_Avoid_: Rendered video, exported reel

**Highlight Window（高光窗口）**:
The candidate range around a positive highlight, initially extending five seconds before and three seconds after its event time.
_Avoid_: Final trim, fixed clip

**Highlight Plan（高光方案）**:
A scope-specific record of the user's included-positive-highlight choices and refined preview-segment boundaries, retained while working and preserved only when the user exports the annotation project.
_Avoid_: Duplicate annotation records, automatic save, cached statistics

**Shooting Summary（投篮统计）**:
A player's made shots over confirmed shot attempts and explicitly recorded good-defense count, accompanied by the resulting shooting percentage; unreviewed shots are excluded.
_Avoid_: Highlight count, combined-player percentage

**Hoop Region（篮筐区域）**:
The source video’s reusable rectangular hoop annotation, shared by every shot record in an annotation project.
_Avoid_: Rim ROI, rim box
