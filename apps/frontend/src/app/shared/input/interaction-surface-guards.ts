import {
  applyDirectManipulationStyles,
  installSafariGestureGuards,
} from "./pointer-event-utils";

type GuardListener = {
  target: EventTarget;
  eventName: string;
  listener: EventListener;
  options?: AddEventListenerOptions;
};

export type DirectManipulationGuardOptions = {
  applyStyles?: boolean;
  preventBrowserGestures?: boolean;
  preventNativeDrag?: boolean;
  preventTextSelection?: boolean;
};

export function installDirectManipulationGuards(
  surface: HTMLElement,
  options: DirectManipulationGuardOptions = {},
): () => void {
  const {
    applyStyles = true,
    preventBrowserGestures = true,
    preventNativeDrag = true,
    preventTextSelection = true,
  } = options;

  const listeners: GuardListener[] = [];
  const cleanups: Array<() => void> = [];

  if (applyStyles) {
    applyDirectManipulationStyles(surface);
  }

  if (preventBrowserGestures) {
    cleanups.push(installSafariGestureGuards(surface));
  }

  const addGuard = (
    target: EventTarget,
    eventName: string,
    listener: EventListener,
    listenerOptions: AddEventListenerOptions = {passive: false},
  ): void => {
    target.addEventListener(eventName, listener, listenerOptions);
    listeners.push({target, eventName, listener, options: listenerOptions});
  };

  const preventInsideSurface = (event: Event): void => {
    if (!isEventInsideSurface(surface, event)) {
      return;
    }

    if (isEditableEventTarget(event.target)) {
      return;
    }

    event.preventDefault();
  };

  if (preventNativeDrag) {
    addGuard(surface, "dragstart", preventInsideSurface);
  }

  if (preventTextSelection) {
    addGuard(surface, "selectstart", preventInsideSurface);
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }

    for (const {target, eventName, listener, options: listenerOptions} of listeners) {
      target.removeEventListener(eventName, listener, listenerOptions);
    }

    listeners.length = 0;
  };
}

function isEventInsideSurface(surface: HTMLElement, event: Event): boolean {
  const target = event.target;
  return target instanceof Node && surface.contains(target);
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !!target.closest("input, textarea, select, button, [contenteditable='true']");
}
