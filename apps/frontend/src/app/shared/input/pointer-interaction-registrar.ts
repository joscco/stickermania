import {capturePointer, releasePointer} from "./pointer-event-utils";
import {installDirectManipulationGuards} from "./interaction-surface-guards";

export type ClientPoint = {
  clientX: number;
  clientY: number;
};

export type PointerInteractionSnapshot<TContext> = {
  context: TContext;
  event: PointerEvent;
  pointerId: number;
  sourceElement: HTMLElement;
  startPoint: ClientPoint;
  point: ClientPoint;
  deltaX: number;
  deltaY: number;
  distance: number;
  elapsedMs: number;
};

export type PointerInteractionCallbacks<TContext> = {
  onStart?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onMove?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onEnd?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
  onCancel?: (snapshot: PointerInteractionSnapshot<TContext>) => void;
};

export type PointerInteractionRegistrarOptions = {
  leftMouseOnly?: boolean;
  stopPropagationOnStart?: boolean;
  preventDefaultOnStart?: boolean;
  installSurfaceGuards?: boolean;
};

type ActiveInteraction<TContext> = {
  context: TContext;
  pointerId: number;
  sourceElement: HTMLElement;
  startPoint: ClientPoint;
  point: ClientPoint;
  startedAt: number;
  callbacks: PointerInteractionCallbacks<TContext>;
  removeSurfaceGuards: (() => void) | null;
};

export class PointerInteractionRegistrar<TContext> {
  private activeInteraction: ActiveInteraction<TContext> | null = null;

  constructor(private readonly options: PointerInteractionRegistrarOptions = {}) {}

  start(
    event: PointerEvent,
    context: TContext,
    callbacks: PointerInteractionCallbacks<TContext>,
  ): boolean {
    if (this.activeInteraction) {
      return false;
    }

    if ((this.options.leftMouseOnly ?? true) && event.pointerType === "mouse" && event.button !== 0) {
      return false;
    }

    const sourceElement = event.currentTarget;

    if (!(sourceElement instanceof HTMLElement)) {
      return false;
    }

    if (this.options.preventDefaultOnStart) {
      event.preventDefault();
    }

    if (this.options.stopPropagationOnStart) {
      event.stopPropagation();
    }

    const point = {
      clientX: event.clientX,
      clientY: event.clientY,
    };

    const removeSurfaceGuards = this.options.installSurfaceGuards ?? true
      ? installDirectManipulationGuards(sourceElement)
      : null;

    capturePointer(sourceElement, event.pointerId);

    this.activeInteraction = {
      context,
      pointerId: event.pointerId,
      sourceElement,
      startPoint: point,
      point,
      startedAt: Date.now(),
      callbacks,
      removeSurfaceGuards,
    };

    window.addEventListener("pointermove", this.onWindowPointerMove, {capture: true, passive: false});
    window.addEventListener("pointerup", this.onWindowPointerUp, {capture: true, passive: false});
    window.addEventListener("pointercancel", this.onWindowPointerCancel, {capture: true, passive: false});

    callbacks.onStart?.(this.snapshot(event));

    return true;
  }

  dispose(): void {
    this.cleanupActiveInteraction();
  }

  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    const active = this.activeInteraction;

    if (!active || event.pointerId !== active.pointerId) {
      return;
    }

    active.point = {
      clientX: event.clientX,
      clientY: event.clientY,
    };

    active.callbacks.onMove?.(this.snapshot(event));
  };

  private readonly onWindowPointerUp = (event: PointerEvent): void => {
    const active = this.activeInteraction;

    if (!active || event.pointerId !== active.pointerId) {
      return;
    }

    const snapshot = this.snapshot(event);

    try {
      active.callbacks.onEnd?.(snapshot);
    } finally {
      this.cleanupActiveInteraction();
    }
  };

  private readonly onWindowPointerCancel = (event: PointerEvent): void => {
    const active = this.activeInteraction;

    if (!active || event.pointerId !== active.pointerId) {
      return;
    }

    const snapshot = this.snapshot(event);

    try {
      active.callbacks.onCancel?.(snapshot);
    } finally {
      this.cleanupActiveInteraction();
    }
  };

  private snapshot(event: PointerEvent): PointerInteractionSnapshot<TContext> {
    const active = this.activeInteraction;

    if (!active) {
      throw new Error("Cannot create pointer interaction snapshot without an active interaction.");
    }

    const deltaX = active.point.clientX - active.startPoint.clientX;
    const deltaY = active.point.clientY - active.startPoint.clientY;

    return {
      context: active.context,
      event,
      pointerId: active.pointerId,
      sourceElement: active.sourceElement,
      startPoint: active.startPoint,
      point: active.point,
      deltaX,
      deltaY,
      distance: Math.hypot(deltaX, deltaY),
      elapsedMs: Date.now() - active.startedAt,
    };
  }

  private cleanupActiveInteraction(): void {
    const active = this.activeInteraction;

    if (!active) {
      return;
    }

    releasePointer(active.sourceElement, active.pointerId);
    active.removeSurfaceGuards?.();

    window.removeEventListener("pointermove", this.onWindowPointerMove, {capture: true});
    window.removeEventListener("pointerup", this.onWindowPointerUp, {capture: true});
    window.removeEventListener("pointercancel", this.onWindowPointerCancel, {capture: true});

    this.activeInteraction = null;
  }
}
