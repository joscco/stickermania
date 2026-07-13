type GuardListener = {
  target: EventTarget;
  event: string;
  handler: EventListener;
};

export function applyDirectManipulationStyles(element: HTMLElement): void {
  element.style.touchAction = "none";
  element.style.userSelect = "none";
  element.style.setProperty("-webkit-touch-callout", "none");
  element.style.setProperty("-webkit-user-select", "none");
}

export function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Safari can reject touch/pen pointer capture after gesture cancellation.
  }
}

export function releasePointer(element: HTMLElement, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer may already be released after pointercancel.
  }
}

export function installSafariGestureGuards(surface: HTMLElement): () => void {
  const listeners: GuardListener[] = [];
  let lastTouchStart = 0;

  const containsEventTarget = (event: Event): boolean => {
    const target = event.target;
    return target instanceof Node && surface.contains(target);
  };

  const guard = (target: EventTarget, event: string, handler: EventListener): void => {
    target.addEventListener(event, handler, {passive: false});
    listeners.push({target, event, handler});
  };

  const blockInsideSurface = (event: Event): void => {
    if (containsEventTarget(event)) {
      event.preventDefault();
    }
  };

  const blockMultiTouchInsideSurface = (event: Event): void => {
    const touchEvent = event as TouchEvent;
    if (touchEvent.touches.length > 1 && containsEventTarget(event)) {
      event.preventDefault();
    }
  };

  const blockDoubleTapInsideSurface = (event: Event): void => {
    if (!containsEventTarget(event)) {
      return;
    }

    const now = Date.now();
    if (now - lastTouchStart < 500) {
      event.preventDefault();
    }
    lastTouchStart = now;
  };

  for (const event of ["gesturestart", "gesturechange", "gestureend", "dblclick", "contextmenu"]) {
    guard(document, event, blockInsideSurface);
  }

  guard(document, "touchstart", blockDoubleTapInsideSurface);
  guard(document, "touchmove", blockMultiTouchInsideSurface);
  guard(surface, "touchstart", blockMultiTouchInsideSurface);

  return () => {
    for (const {target, event, handler} of listeners) {
      target.removeEventListener(event, handler);
    }
    listeners.length = 0;
  };
}
