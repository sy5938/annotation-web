import type { AnnotationRecord } from "./annotation-project";

export type PreviewSegment = {
  start_seconds: number;
  end_seconds: number;
};

export type Preview = {
  ready: boolean;
  segments: PreviewSegment[];
  total_seconds: number;
  segment_count: number;
};

export function buildPreview(
  records: AnnotationRecord[],
  videoDuration: number,
  paddingSeconds = 5,
): Preview {
  if (videoDuration <= 0) return emptyPreview(false);

  const windows = records
    .filter((record) => record.kind === "shot")
    .map((record) => {
      const shotTime = Math.min(videoDuration, Math.max(0, record.result_time_seconds));
      return {
        start_seconds: Math.max(0, shotTime - paddingSeconds),
        end_seconds: Math.min(videoDuration, shotTime + paddingSeconds),
      };
    })
    .sort((a, b) => a.start_seconds - b.start_seconds);

  const segments: PreviewSegment[] = [];
  for (const window of windows) {
    const previous = segments.at(-1);
    if (!previous || window.start_seconds > previous.end_seconds) {
      segments.push({ ...window });
    } else {
      previous.end_seconds = Math.max(previous.end_seconds, window.end_seconds);
    }
  }

  const totalSeconds = segments.reduce(
    (total, segment) => total + segment.end_seconds - segment.start_seconds,
    0,
  );
  return {
    ready: true,
    segments,
    total_seconds: Number(totalSeconds.toFixed(3)),
    segment_count: segments.length,
  };
}

function emptyPreview(ready: boolean): Preview {
  return { ready, segments: [], total_seconds: 0, segment_count: 0 };
}
