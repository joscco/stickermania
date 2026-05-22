import type {StickerGestureHandler} from './sticker-gesture-handler';

export function installCanvasInputListeners(
    el: HTMLElement,
    gesture: StickerGestureHandler,
    onInteractionStart: () => void,
    isBlocked: () => boolean = () => false,
): () => void {
    el.style.touchAction = 'none';
    (el.style as any).webkitTouchCallout = 'none';
    (el.style as any).webkitUserSelect   = 'none';

    const onPointerDown = (ev: PointerEvent) => {
        if (isBlocked() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        ev.preventDefault();
        onInteractionStart();
        el.setPointerCapture(ev.pointerId);
        gesture.onPointerDown(ev.pointerId, ev.clientX, ev.clientY);
    };

    const onPointerMove = (ev: PointerEvent) => {
        if (isBlocked()) return;
        ev.preventDefault();
        gesture.onPointerMove(ev.pointerId, ev.clientX, ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
        if (isBlocked()) return;
        ev.preventDefault();
        gesture.onPointerUp(ev.pointerId, ev.clientX, ev.clientY);
    };

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

