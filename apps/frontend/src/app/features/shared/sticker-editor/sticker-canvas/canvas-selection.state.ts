import {signal, computed} from '@angular/core';

export class CanvasSelectionState {
  readonly selectedInstanceId = signal<string | null>(null);
  readonly lassoSelection = signal<Set<string>>(new Set());
  readonly isMoveActive = signal(false);
  readonly multiSelectionRotation = signal(0);
  readonly dragNearEdge = signal(false);

  readonly hasSelection = computed(() =>
    !!this.selectedInstanceId() || this.lassoSelection().size > 0);

  readonly isMultiSelection = computed(() =>
    this.lassoSelection().size > 1);

  readonly selectionIds = computed<string[]>(() => {
    const ls = this.lassoSelection();
    if (ls.size > 0) return [...ls];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  isSelected(id: string): boolean {
    return this.selectedInstanceId() === id || this.lassoSelection().has(id);
  }

  isLassoSelected(id: string): boolean {
    return this.lassoSelection().has(id);
  }

  clear(): void {
    this.selectedInstanceId.set(null);
    this.lassoSelection.set(new Set());
    this.multiSelectionRotation.set(0);
  }
}
