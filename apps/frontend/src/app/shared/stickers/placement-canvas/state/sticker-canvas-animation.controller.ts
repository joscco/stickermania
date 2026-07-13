import type {StickerAnimState} from "../../primitives/sticker-item/sticker-item.component";
import {StickerCanvasAnimationState} from "./sticker-canvas-animation.state";

export class StickerCanvasAnimationController {
  private readonly transientClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly emitChange: (states: Record<string, StickerAnimState>) => void,
    private readonly state = new StickerCanvasAnimationState(),
  ) {}

  get(id: string): StickerAnimState {
    return this.state.get(id);
  }

  set(id: string, state: StickerAnimState): void {
    this.state.set(id, state);
    this.scheduleTransientClear(id, state);
    this.emit();
  }

  clear(id: string): void {
    this.clearTransientTimer(id);
    this.state.clear(id);
    this.emit();
  }

  scheduleRemoval(ids: string[], done: () => void): void {
    ids.forEach(id => this.clearTransientTimer(id));
    this.state.scheduleRemoval(ids, () => {
      done();
      this.emit();
    });
    this.emit();
  }

  onRemoved(id: string): void {
    this.state.onRemoved(id);
    this.emit();
  }

  destroy(): void {
    this.transientClearTimers.forEach(timer => clearTimeout(timer));
    this.transientClearTimers.clear();
    this.state.destroy();
    this.emitChange({});
  }

  private scheduleTransientClear(id: string, state: StickerAnimState): void {
    this.clearTransientTimer(id);
    if (state !== "entering" && state !== "settling") {
      return;
    }

    const timer = setTimeout(() => {
      this.transientClearTimers.delete(id);
      if (this.state.get(id) === state) {
        this.state.clear(id);
        this.emit();
      }
    }, state === "entering" ? 280 : 430);
    this.transientClearTimers.set(id, timer);
  }

  private clearTransientTimer(id: string): void {
    const timer = this.transientClearTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.transientClearTimers.delete(id);
    }
  }

  private emit(): void {
    this.emitChange(this.state.snapshot());
  }
}
