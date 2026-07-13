import {PointerInteractionRegistrar, PointerInteractionSnapshot} from './pointer-interaction-registrar';
import {installDirectManipulationGuards} from './interaction-surface-guards';

export type PressDragSnapshot<TContext> = PointerInteractionSnapshot<TContext> & {
  wasDragging: boolean;
};

export type PressDragControllerOptions<TContext> = {
  dragThresholdPx?: number | ((snapshot: PointerInteractionSnapshot<TContext>) => number);
  holdDelayMs?: number;
  suppressClickMs?: number;
  contextKey?: (context: TContext) => string;
  requireHoldBeforeDrag?: boolean | ((snapshot: PointerInteractionSnapshot<TContext>) => boolean);
  onPressStart?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onPressMove?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onHold?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onDragStart?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onDragMove?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onDrop?: (snapshot: PressDragSnapshot<TContext>) => void;
  onCancel?: (snapshot: PressDragSnapshot<TContext>) => void;
};

export class PressDragController<TContext> {
  private readonly registrar = new PointerInteractionRegistrar<TContext>({
    leftMouseOnly: true,
    stopPropagationOnStart: true,
    preventDefaultOnStart: false,
    installSurfaceGuards: false,
  });

  private dragging = false;
  private lastSnapshot: PointerInteractionSnapshot<TContext> | null = null;
  private holdSatisfied = false;
  private removeActiveDragGuards: (() => void) | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressedContextKey: string | null = null;
  private suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: PressDragControllerOptions<TContext>) {}

  start(event: PointerEvent, context: TContext): boolean {
    return this.registrar.start(event, context, {
      onStart: snapshot => this.handleStart(snapshot),
      onMove: snapshot => this.handleMove(snapshot),
      onEnd: snapshot => this.handleEnd(snapshot),
      onCancel: snapshot => this.handleCancel(snapshot),
    });
  }

  shouldSuppressClick(context: TContext): boolean {
    const contextKey = this.contextKey(context);
    return !!contextKey && contextKey === this.suppressedContextKey;
  }

  dispose(): void {
    this.clearHoldTimer();
    this.clearSuppressClickTimer();
    this.registrar.dispose();
    this.cleanupActiveDragGuards();
    this.dragging = false;
    this.holdSatisfied = false;
    this.lastSnapshot = null;
    this.suppressedContextKey = null;
  }

  private handleStart(snapshot: PointerInteractionSnapshot<TContext>): void {
    this.dragging = false;
    this.holdSatisfied = false;
    this.cleanupActiveDragGuards();
    this.lastSnapshot = snapshot;
    this.options.onPressStart?.(snapshot);
    this.scheduleHold();
  }

  private handleMove(snapshot: PointerInteractionSnapshot<TContext>): void {
    this.lastSnapshot = snapshot;

    const dragThresholdPx = this.resolveDragThreshold(snapshot);

    if (!this.dragging && snapshot.distance <= dragThresholdPx) {
      this.options.onPressMove?.(snapshot);
      return;
    }

    if (!this.dragging && this.requiresHoldBeforeDrag(snapshot) && !this.holdSatisfied) {
      this.options.onPressMove?.(snapshot);
      return;
    }

    snapshot.event.preventDefault();
    snapshot.event.stopPropagation();

    if (!this.dragging) {
      this.dragging = true;
      this.clearHoldTimer();
      this.installActiveDragGuards(snapshot.sourceElement);
      this.options.onDragStart?.(snapshot);
    }

    this.options.onDragMove?.(snapshot);
  }

  private resolveDragThreshold(snapshot: PointerInteractionSnapshot<TContext>): number {
    const threshold = this.options.dragThresholdPx ?? 5;

    if (typeof threshold === "function") {
      return threshold(snapshot);
    }

    return threshold;
  }

  private handleEnd(snapshot: PointerInteractionSnapshot<TContext>): void {
    const wasDragging = this.dragging;

    if (wasDragging) {
      snapshot.event.preventDefault();
      snapshot.event.stopPropagation();
      this.suppressClick(snapshot.context);
    }

    this.clearHoldTimer();

    this.options.onDrop?.({
      ...snapshot,
      wasDragging,
    });

    this.cleanupActiveDragGuards();
    this.dragging = false;
    this.holdSatisfied = false;
    this.lastSnapshot = null;
  }

  private handleCancel(snapshot: PointerInteractionSnapshot<TContext>): void {
    const wasDragging = this.dragging;

    this.clearHoldTimer();

    this.options.onCancel?.({
      ...snapshot,
      wasDragging,
    });

    this.cleanupActiveDragGuards();
    this.dragging = false;
    this.holdSatisfied = false;
    this.lastSnapshot = null;
  }

  private scheduleHold(): void {
    this.clearHoldTimer();

    const holdDelayMs = this.options.holdDelayMs;

    if (holdDelayMs === undefined || holdDelayMs < 0) {
      return;
    }

    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;

      if (this.dragging || !this.lastSnapshot) {
        return;
      }

      this.holdSatisfied = true;
      this.options.onHold?.(this.lastSnapshot);
    }, holdDelayMs);
  }

  private clearHoldTimer(): void {
    if (!this.holdTimer) {
      return;
    }

    clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private suppressClick(context: TContext): void {
    const contextKey = this.contextKey(context);

    if (!contextKey) {
      return;
    }

    this.clearSuppressClickTimer();

    this.suppressedContextKey = contextKey;
    this.suppressClickTimer = setTimeout(() => {
      if (this.suppressedContextKey === contextKey) {
        this.suppressedContextKey = null;
      }

      this.suppressClickTimer = null;
    }, this.options.suppressClickMs ?? 80);
  }

  private clearSuppressClickTimer(): void {
    if (!this.suppressClickTimer) {
      return;
    }

    clearTimeout(this.suppressClickTimer);
    this.suppressClickTimer = null;
  }


  private requiresHoldBeforeDrag(snapshot: PointerInteractionSnapshot<TContext>): boolean {
    const option = this.options.requireHoldBeforeDrag ?? false;

    return typeof option === "function" ? option(snapshot) : option;
  }

  private installActiveDragGuards(sourceElement: HTMLElement): void {
    this.cleanupActiveDragGuards();
    this.removeActiveDragGuards = installDirectManipulationGuards(sourceElement, {applyStyles: false});
  }

  private cleanupActiveDragGuards(): void {
    this.removeActiveDragGuards?.();
    this.removeActiveDragGuards = null;
  }

  private contextKey(context: TContext): string | null {
    return this.options.contextKey?.(context) ?? null;
  }
}
