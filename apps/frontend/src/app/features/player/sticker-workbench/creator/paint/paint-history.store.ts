export type PaintHistorySnapshot = {
  baseDataUrl: string;
  paintDataUrl: string;
};

export class PaintHistoryStore {
  private snapshots: PaintHistorySnapshot[] = [];

  constructor(private readonly maxSnapshots = 3) {}

  get canUndo(): boolean {
    return this.snapshots.length > 0;
  }

  get size(): number {
    return this.snapshots.length;
  }

  push(snapshot: PaintHistorySnapshot): void {
    this.snapshots = [
      ...this.snapshots.slice(-(this.maxSnapshots - 1)),
      snapshot,
    ];
  }

  pop(): PaintHistorySnapshot | null {
    return this.snapshots.pop() ?? null;
  }

  discardLatest(): void {
    void this.snapshots.pop();
  }

  clear(): void {
    this.snapshots = [];
  }
}
