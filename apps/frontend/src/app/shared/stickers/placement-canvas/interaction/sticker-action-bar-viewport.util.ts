import {ActionBarViewportBounds} from '../sticker-action-bar/sticker-action-bar.component';

export type ViewportRect = {left: number; top: number; right: number; bottom: number};

export function actionBarViewportBoundsForCanvas(
  canvasElement: HTMLElement,
  fallbackBounds: ActionBarViewportBounds,
): ActionBarViewportBounds {
  if (typeof window === "undefined") {
    return fallbackBounds;
  }

  const canvasRect = canvasElement.getBoundingClientRect();
  const visibleRect = visibleViewportRectForElement(canvasElement);

  const minX = Math.max(0, visibleRect.left - canvasRect.left);
  const minY = Math.max(0, visibleRect.top - canvasRect.top);
  const maxX = Math.min(canvasRect.width, visibleRect.right - canvasRect.left);
  const maxY = Math.min(canvasRect.height, visibleRect.bottom - canvasRect.top);

  return maxX > minX && maxY > minY
    ? {minX, minY, maxX, maxY}
    : fallbackBounds;
}

export function viewportBoundsEqual(
  current: ActionBarViewportBounds | null,
  next: ActionBarViewportBounds,
  tolerance = 0.5,
): boolean {
  return !!current
    && Math.abs(current.minX - next.minX) < tolerance
    && Math.abs(current.minY - next.minY) < tolerance
    && Math.abs(current.maxX - next.maxX) < tolerance
    && Math.abs(current.maxY - next.maxY) < tolerance;
}

function visibleViewportRectForElement(element: HTMLElement): ViewportRect {
  const viewport = window.visualViewport;
  const result: ViewportRect = {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
    bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
  };

  let node = element.parentElement;
  while (node && node !== document.documentElement) {
    if (clipsOverflow(node)) {
      const rect = node.getBoundingClientRect();
      result.left = Math.max(result.left, rect.left);
      result.top = Math.max(result.top, rect.top);
      result.right = Math.min(result.right, rect.right);
      result.bottom = Math.min(result.bottom, rect.bottom);
    }
    node = node.parentElement;
  }

  return result;
}

function clipsOverflow(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return /(auto|hidden|scroll|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
}
