export interface PointerSurfaceHandler {
  pointerDown(event: PointerEvent): void;
  pointerMove(event: PointerEvent): void;
  pointerUp(event: PointerEvent): void;
  pointerCancel(event: PointerEvent): void;
  wheel(event: WheelEvent): void;
}

export type PointerSurfaceHandlerLike = Partial<PointerSurfaceHandler>;

export const noopPointerSurfaceHandler: PointerSurfaceHandler = {
  pointerDown: () => undefined,
  pointerMove: () => undefined,
  pointerUp: () => undefined,
  pointerCancel: () => undefined,
  wheel: () => undefined,
};
