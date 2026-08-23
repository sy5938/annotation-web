import type { AnnotationRecord } from "./annotation-project";

export type RecordChange = {
  kind: "add" | "delete";
  record: AnnotationRecord;
  index: number;
};

export type RecordHistory = {
  past: RecordChange[];
  future: RecordChange[];
};

export type RecordHistoryResult = {
  records: AnnotationRecord[];
  history: RecordHistory;
  change: RecordChange;
};

export function emptyRecordHistory(): RecordHistory {
  return { past: [], future: [] };
}

export function commitRecordChange(history: RecordHistory, change: RecordChange): RecordHistory {
  return { past: [...history.past, change], future: [] };
}

export function undoRecordChange(
  records: AnnotationRecord[],
  history: RecordHistory,
): RecordHistoryResult | null {
  const storedChange = history.past.at(-1);
  if (!storedChange) return null;
  const currentRecord = storedChange.kind === "add"
    ? records.find((record) => record.id === storedChange.record.id)
    : null;
  const change = currentRecord ? { ...storedChange, record: currentRecord } : storedChange;
  return {
    records: change.kind === "add" ? removeRecord(records, change.record.id) : insertRecord(records, change),
    history: { past: history.past.slice(0, -1), future: [...history.future, change] },
    change,
  };
}

export function redoRecordChange(
  records: AnnotationRecord[],
  history: RecordHistory,
): RecordHistoryResult | null {
  const change = history.future.at(-1);
  if (!change) return null;
  return {
    records: change.kind === "add" ? insertRecord(records, change) : removeRecord(records, change.record.id),
    history: { past: [...history.past, change], future: history.future.slice(0, -1) },
    change,
  };
}

function removeRecord(records: AnnotationRecord[], id: string): AnnotationRecord[] {
  return records.filter((record) => record.id !== id);
}

function insertRecord(records: AnnotationRecord[], change: RecordChange): AnnotationRecord[] {
  const index = Math.max(0, Math.min(records.length, change.index));
  return [...records.slice(0, index), change.record, ...records.slice(index)];
}
