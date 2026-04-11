import type {StickerGestureHandler} from './sticker-gesture-handler';

/**
 * Installs all pointer/touch/mouse event listeners on the canvas element.
 * Returns a cleanup function that removes every listener.
 *
 * Rules:
 * - Overlay elements (context menu, handles) are excluded via `[data-canvas-overlay]`
 * - touchmove/touchend on overlay elements are NOT prevented so click synthesis works
 * - Mouse drag is tracked globally (document) so fast moves don't lose the pointer
 */
export function installCanvasInputListeners(
    el: HTMLElement,
    gesture: StickerGestureHandler,
    onInteractionStart: () => void,
): () => void {
    el.style.touchAction = 'none';
    (el.style as any).webkitTouchCallout = 'none';
    (el.style as any).webkitUserSelect   = 'none';

    const isOverlay = (ev: Event) =>
        !!(ev.target as HTMLElement).closest('[data-canvas-overlay]');

    // ── Touch ─────────────────────────────────────────────────────────────────

    const onTouchStart = (ev: TouchEvent) => {
        if (isOverlay(ev)) return;
        ev.preventDefault();
        onInteractionStart();
        for (const t of Array.from(ev.changedTouches))
            gesture.onPointerDown(t.identifier, t.clientX, t.clientY);
    };
    const onTouchMove = (ev: TouchEvent) => {
        if (isOverlay(ev)) return;
        ev.preventDefault();
        for (const t of Array.from(ev.changedTouches))
            gesture.onPointerMove(t.identifier, t.clientX, t.clientY);
    };
    const onTouchEnd = (ev: TouchEvent) => {
        if (isOverlay(ev)) return;
        ev.preventDefault();
        for (const t of Array.from(ev.changedTouches))
            gesture.onPointerUp(t.identifier, t.clientX, t.clientY);
    };

    // ── Mouse ─────────────────────────────────────────────────────────────────

    let cleanupMouse: (() => void) | null = null;

    const onMouseDown = (ev: MouseEvent) => {
        if (ev.button !== 0 || isOverlay(ev)) return;
        ev.preventDefault();
        onInteractionStart();
        gesture.onPointerDown(-1, ev.clientX, ev.clientY);

        const onMove = (e: MouseEvent) => {
            e.preventDefault();
            gesture.onPointerMove(-1, e.clientX, e.clientY);
        };
        const onUp = (e: MouseEvent) => {
            gesture.onPointerUp(-1, e.clientX, e.clientY);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            cleanupMouse = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        cleanupMouse = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
    };

    // ── Register ──────────────────────────────────────────────────────────────

    el.addEventListener('touchstart',  onTouchStart, {passive: false});
    el.addEventListener('touchmove',   onTouchMove,  {passive: false});
    el.addEventListener('touchend',    onTouchEnd,   {passive: false});
    el.addEventListener('touchcancel', onTouchEnd,   {passive: false});
    el.addEventListener('mousedown',   onMouseDown);

    return () => {
        el.removeEventListener('touchstart',  onTouchStart as EventListener);
        el.removeEventListener('touchmove',   onTouchMove  as EventListener);
        el.removeEventListener('touchend',    onTouchEnd   as EventListener);
        el.removeEventListener('touchcancel', onTouchEnd   as EventListener);
        el.removeEventListener('mousedown',   onMouseDown);
        cleanupMouse?.();
    };
}

