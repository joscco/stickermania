import {signal, computed} from '@angular/core';

export type CanvasSelectionMode = "auto" | "multi";

export class CanvasSelectionState {
  readonly selectedInstanceId = signal<string | null>(null);
  readonly multiSelection = signal<Set<string>>(new Set());
  readonly isMoveActive = signal(false);
  readonly multiSelectionRotation = signal(0);

  readonly hasSelection = computed(() =>
    !!this.selectedInstanceId() || this.multiSelection().size > 0);

  readonly selectionIds = computed<string[]>(() => {
    const multi = this.multiSelection();
    if (multi.size > 0) return [...multi];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  isSelected(id: string): boolean {
    return this.selectedInstanceId() === id || this.multiSelection().has(id);
  }

  selectSingle(id: string): void {
    this.selectedInstanceId.set(id);
    this.multiSelection.set(new Set());
  }

  selectMany(ids: string[]): void {
    if (!ids.length) {
      this.clear();
      return;
    }

    this.selectedInstanceId.set(null);
    this.multiSelection.set(new Set(ids));
  }

  selectIds(ids: string[], mode: CanvasSelectionMode = "auto"): void {
    if (mode === "auto" && ids.length === 1) {
      this.selectSingle(ids[0]);
      return;
    }

    this.selectMany(ids);
  }

  clear(): void {
    this.selectedInstanceId.set(null);
    this.multiSelection.set(new Set());
    this.multiSelectionRotation.set(0);
  }
}
