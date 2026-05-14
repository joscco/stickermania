import type {StickerPlacement} from "@birthday/shared";
import type {StickerDragStartEvent} from "./sticker-palette/sticker-palette.component";
import type {StickerCanvasComponent} from "./sticker-canvas/sticker-canvas.component";
import {
    isPointerOutsideRect,
    isPositionOutsideCanvas,
    clamp,
    radToDeg,
    pinchDistance,
    pinchAngle,
} from "./geometry-helpers";

/**
 * Self-contained drag session for a sticker dragged from the palette onto the canvas.
 * Manages all pointer tracking (move, pinch, multi-touch) and delegates state
 * changes to the canvas via signals and placement callbacks.
 */
export class PaletteDragSession {
    private cleanupFn: (() => void) | null = null;
    private canvas: StickerCanvasComponent;
    private canvasEl: HTMLDivElement;
    private getPlacements: () => StickerPlacement[];
    private updatePlacements: (p: StickerPlacement[]) => void;
    private onDrop: (instanceId: string, isOutside: boolean) => void;

    constructor(deps: {
        canvasEl: HTMLDivElement;
        canvas: StickerCanvasComponent;
        getPlacements: () => StickerPlacement[];
        updatePlacements: (p: StickerPlacement[]) => void;
        onDrop: (instanceId: string, isOutside: boolean) => void;
    }) {
        this.canvas = deps.canvas;
        this.canvasEl = deps.canvasEl;
        this.getPlacements = deps.getPlacements;
        this.updatePlacements = deps.updatePlacements;
        this.onDrop = deps.onDrop;
    }

    start(event: StickerDragStartEvent, placement: StickerPlacement): void {
        const instanceId = placement.instanceId;

        let x = placement.x;
        let y = placement.y;
        let scale = placement.scale;
        let rotation = placement.rotation;

        const pointers = new Map<number, { x: number; y: number }>();
        pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});

        let pinchBaseDist = 0;
        let pinchBaseAngle = 0;
        let pinchBaseScale = 1;
        let pinchBaseRotation = 0;

        let wasInsideCanvas = false;
        let wasOutside = true;

        const isOutside = (cx: number, cy: number, r: DOMRect): boolean =>
            isPointerOutsideRect(cx, cy, r) || isPositionOutsideCanvas(x, y, r);

        const update = () => {
            this.updatePlacements(
                this.getPlacements().map(p =>
                    p.instanceId === instanceId
                        ? {...p, x, y, scale, rotation}
                        : p,
                ),
            );
        };

        const initPinch = () => {
            const pts = [...pointers.values()];
            if (pts.length < 2) return;
            const pp = {ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y};
            pinchBaseDist = pinchDistance(pp);
            pinchBaseAngle = pinchAngle(pp);
            pinchBaseScale = scale;
            pinchBaseRotation = rotation;
        };

        const onPointerDown = (ev: PointerEvent) => {
            pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
            if (pointers.size === 2) initPinch();
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!pointers.has(ev.pointerId)) return;
            ev.preventDefault();

            const prev = pointers.get(ev.pointerId)!;
            pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});

            const r = this.canvasEl.getBoundingClientRect();

            if (pointers.size >= 2) {
                const pts = [...pointers.values()];
                const pp = {ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y};
                scale = clamp(pinchBaseScale * (pinchDistance(pp) / pinchBaseDist), 0.2, 4);
                rotation = pinchBaseRotation + radToDeg(pinchAngle(pp) - pinchBaseAngle);
                x += (ev.clientX - prev.x) / 2;
                y += (ev.clientY - prev.y) / 2;
            } else {
                x += ev.clientX - prev.x;
                y += ev.clientY - prev.y;
            }

            const outside = isOutside(ev.clientX, ev.clientY, r);
            if (wasOutside && !outside) wasInsideCanvas = true;
            wasOutside = outside;
            this.canvas.stickerWouldBeDeleted.set(!wasInsideCanvas || outside);
            update();
            this.canvas.isMoveActive.set(true);
        };

        const onPointerUp = (ev: PointerEvent) => {
            const prev = pointers.get(ev.pointerId);
            if (prev && pointers.size === 1) {
                x += ev.clientX - prev.x;
                y += ev.clientY - prev.y;
                update();
            }

            pointers.delete(ev.pointerId);

            if (pointers.size === 1) {
                initPinch();
                return;
            }
            if (pointers.size > 0) return;

            const r = this.canvasEl.getBoundingClientRect();
            const outside = isPointerOutsideRect(ev.clientX, ev.clientY, r)
                || isPositionOutsideCanvas(x, y, r);

            this.canvas.isMoveActive.set(false);
            this.canvas.stickerWouldBeDeleted.set(false);
            cleanup();

            this.onDrop(instanceId, outside);
        };

        const cleanup = () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            this.canvas.isMoveActive.set(false);
            this.canvas.stickerWouldBeDeleted.set(false);
            this.canvas.paletteDragInProgress.set(false);
            this.cleanupFn = null;
        };

        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove, {passive: false});
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        this.cleanupFn = cleanup;
    }

    abort(): void {
        this.cleanupFn?.();
    }
}
