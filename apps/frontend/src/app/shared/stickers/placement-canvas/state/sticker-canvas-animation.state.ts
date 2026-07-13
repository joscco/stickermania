import {signal} from "@angular/core";
import {StickerAnimState} from '../../primitives/sticker-item/sticker-item.component';

export class StickerCanvasAnimationState {
  private readonly animStates = signal<Map<string, StickerAnimState>>(new Map());
  private readonly pendingRemovals = new Map<string, () => void>();
  private readonly removeFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  get(id: string): StickerAnimState {
    return this.animStates().get(id) ?? "idle";
  }

  snapshot(): Record<string, StickerAnimState> {
    return Object.fromEntries(this.animStates());
  }

  set(id: string, state: StickerAnimState): void {
    this.animStates.update(map => new Map(map).set(id, state));
  }

  clear(id: string): void {
    this.animStates.update(map => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  scheduleRemoval(ids: string[], done: () => void): void {
    if (!ids.length) {
      done();
      return;
    }

    let pending = ids.length;
    const onOne = () => {
      if (--pending === 0) done();
    };

    ids.forEach(id => {
      this.pendingRemovals.set(id, onOne);
      this.set(id, "removing");
      const timer = setTimeout(() => this.onRemoved(id), 400);
      this.removeFallbackTimers.set(id, timer);
    });
  }

  onRemoved(id: string): void {
    const callback = this.pendingRemovals.get(id);
    const timer = this.removeFallbackTimers.get(id);

    if (timer) clearTimeout(timer);
    this.removeFallbackTimers.delete(id);
    this.pendingRemovals.delete(id);
    this.clear(id);
    callback?.();
  }

  destroy(): void {
    this.removeFallbackTimers.forEach(timer => clearTimeout(timer));
    this.removeFallbackTimers.clear();
    this.pendingRemovals.clear();
  }
}
