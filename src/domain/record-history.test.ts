import { describe, expect, it } from "vitest";
import { commitRecordChange, emptyRecordHistory, redoRecordChange, undoRecordChange } from "./record-history";
import type { ShotRecord } from "./annotation-project";

function shot(id: string): ShotRecord {
  return { id, kind: "shot", player: "A", result_time_seconds: 1, outcome: "made_2", trajectory: [] };
}

describe("record undo and redo", () => {
  it("undoes and redoes an added record", () => {
    const record = shot("added");
    const history = commitRecordChange(emptyRecordHistory(), { kind: "add", record, index: 0 });
    const updated = { ...record, outcome: "made_3" as const };

    const undone = undoRecordChange([updated], history);
    expect(undone?.records).toEqual([]);
    expect(undone?.change).toMatchObject({ kind: "add", record: updated });

    const redone = undone && redoRecordChange(undone.records, undone.history);
    expect(redone?.records).toEqual([updated]);
  });

  it("restores and re-deletes a deleted record", () => {
    const first = shot("first");
    const deleted = shot("deleted");
    const history = commitRecordChange(emptyRecordHistory(), { kind: "delete", record: deleted, index: 1 });

    const undone = undoRecordChange([first], history);
    expect(undone?.records).toEqual([first, deleted]);

    const redone = undone && redoRecordChange(undone.records, undone.history);
    expect(redone?.records).toEqual([first]);
  });

  it("clears the redo branch when a new change is committed", () => {
    const first = shot("first");
    const initial = commitRecordChange(emptyRecordHistory(), { kind: "add", record: first, index: 0 });
    const undone = undoRecordChange([first], initial);
    if (!undone) throw new Error("Expected undo result");

    const next = commitRecordChange(undone.history, { kind: "add", record: shot("next"), index: 0 });
    expect(next.future).toEqual([]);
    expect(redoRecordChange([shot("next")], next)).toBeNull();
  });
});
