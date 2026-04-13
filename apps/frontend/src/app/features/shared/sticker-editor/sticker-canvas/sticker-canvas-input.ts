import type {StickerGestureHandler} from './sticker-gesture-handler';

/**
 * Installs Pointer Events listeners on the canvas element.
 * Returns a cleanup function that removes every listener.
 *
 * Rules:
 * - Overlay elements (context menu, handles) are excluded via `[data-canvas-overlay]`
 * - `setPointerCapture` keeps move/up events routed here even when the pointer
 *   leaves the element – no need for global document listeners anymore.
 * - `touch-action: none` still suppresses native scroll/pinch-zoom.
 */
export function installCanvasInputListeners(
    el: HTMLElement,
    gesture: StickerGestureHandler,
    onInteractionStart: () => void,
    isBlocked: () => boolean = () => false,
): () => void {
    // Prevent default touch behaviors (scroll/pinch-zoom) on the canvas.
    el.style.touchAction = 'none';
    (el.style as any).webkitTouchCallout = 'none';
    (el.style as any).webkitUserSelect   = 'none';

    // Menu or transform overlay
    const isOverlay = (ev: Event) =>
        !!(ev.target as HTMLElement).closest('[data-canvas-overlay]');

    // ── Pointer Events ────────────────────────────────────────────────────────

    const onPointerDown = (ev: PointerEvent) => {
        if (isBlocked() || (ev.pointerType === 'mouse' && ev.button !== 0) || isOverlay(ev)) return;
        ev.preventDefault();
        onInteractionStart();
        el.setPointerCapture(ev.pointerId);
        gesture.onPointerDown(ev.pointerId, ev.clientX, ev.clientY);
    };

    const onPointerMove = (ev: PointerEvent) => {
        if (isBlocked() || isOverlay(ev)) return;
        ev.preventDefault();
        gesture.onPointerMove(ev.pointerId, ev.clientX, ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
        if (isBlocked() || isOverlay(ev)) return;
        ev.preventDefault();
        gesture.onPointerUp(ev.pointerId, ev.clientX, ev.clientY);
    };

    // ── Register ──────────────────────────────────────────────────────────────

    el.addEventListener('pointerdown',   onPointerDown,  {passive: false});
    el.addEventListener('pointermove',   onPointerMove,  {passive: false});
    el.addEventListener('pointerup',     onPointerUp,    {passive: false});
    el.addEventListener('pointercancel', onPointerUp,    {passive: false});

    return () => {
        el.removeEventListener('pointerdown',   onPointerDown);
        el.removeEventListener('pointermove',   onPointerMove);
        el.removeEventListener('pointerup',     onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);
    };
}

