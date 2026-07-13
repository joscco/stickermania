import type {StickerGestureHandler} from './sticker-gesture-handler';
import {markStickerCanvasPointerHit} from './sticker-hit-test.util';
import {applyDirectManipulationStyles, capturePointer, releasePointer} from '../../../input/pointer-event-utils';
import {RafPointerMoveCoalescer} from '../../../input/raf-pointer-move-coalescer';

export type StickerCanvasInputOptions = {
    coalescePointerMoves?: boolean;
};

export function installCanvasInputListeners(
    el: HTMLElement,
    gesture: StickerGestureHandler,
    onInteractionStart: () => void,
    isBlocked: () => boolean = () => false,
    options: StickerCanvasInputOptions = {},
): () => void {
    applyDirectManipulationStyles(el);
    const activePointerIds = new Set<number>();

    const onPointerDown = (ev: PointerEvent) => {
        if (isBlocked() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        onInteractionStart();
        const hitId = gesture.hitIdAt(ev.clientX, ev.clientY);

        if (ev.pointerType === 'touch' && activePointerIds.size > 0 && !activePointerIds.has(ev.pointerId)) {
            gesture.cancelInteraction(true);
            for (const pointerId of activePointerIds) {
                releasePointer(el, pointerId);
            }
            activePointerIds.clear();
            markStickerCanvasPointerHit(ev, {instanceId: hitId, handledByCanvas: false});
            return;
        }

        const handled = gesture.onPointerDown(ev.pointerId, ev.clientX, ev.clientY);
        markStickerCanvasPointerHit(ev, {instanceId: hitId, handledByCanvas: handled});
        if (!handled) return;
        activePointerIds.add(ev.pointerId);
        ev.preventDefault();
        capturePointer(el, ev.pointerId);
    };

    const onPointerMove = (ev: PointerEvent) => {
        if (isBlocked()) return;
        if (!activePointerIds.has(ev.pointerId)) return;
        ev.preventDefault();
        gesture.onPointerMove(ev.pointerId, ev.clientX, ev.clientY);
    };

    const pointerMoveCoalescer = new RafPointerMoveCoalescer(onPointerMove);
    const onPointerMoveInput = (ev: PointerEvent) => {
        if (options.coalescePointerMoves) {
            pointerMoveCoalescer.queue(ev);
            return;
        }

        onPointerMove(ev);
    };

    const onPointerUp = (ev: PointerEvent) => {
        pointerMoveCoalescer.flush();
        if (isBlocked()) return;
        if (!activePointerIds.has(ev.pointerId)) return;
        activePointerIds.delete(ev.pointerId);
        ev.preventDefault();
        gesture.onPointerUp(ev.pointerId, ev.clientX, ev.clientY);
    };

    el.addEventListener('pointerdown',   onPointerDown,  {passive: false});
    el.addEventListener('pointermove',   onPointerMoveInput,  {passive: false});
    el.addEventListener('pointerup',     onPointerUp,    {passive: false});
    el.addEventListener('pointercancel', onPointerUp,    {passive: false});

    return () => {
        pointerMoveCoalescer.cancel();
        el.removeEventListener('pointerdown',   onPointerDown);
        el.removeEventListener('pointermove',   onPointerMoveInput);
        el.removeEventListener('pointerup',     onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);
    };
}
