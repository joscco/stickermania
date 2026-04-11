import {Component, input, output, computed, OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {BoundingBox} from '../sticker-shared/sticker-types';

export interface HandleDragEvent {
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'rotate' | 'n' | 's' | 'e' | 'w';
    dx: number;
    dy: number;
    done: boolean;
}

function rotatePt(x: number, y: number, cx: number, cy: number, rad: number): {x: number; y: number} {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return {x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos};
}

@Component({
    selector: 'app-sticker-selection-overlay',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './sticker-selection-overlay.component.html',
    host: {style: 'position:absolute;inset:0;pointer-events:none;'},
})
export class StickerSelectionOverlayComponent implements OnDestroy {
    readonly box         = input<BoundingBox | null>(null);
    readonly rotation    = input<number>(0);
    readonly stretchMode = input<boolean>(false);

    readonly handleDrag = output<HandleDragEvent>();
    readonly menuToggle = output<void>();

    private activeHandle: HandleDragEvent['handle'] | null = null;
    private lastX = 0;
    private lastY = 0;
    private lastAngle = 0;
    private cleanupPtr: (() => void) | null = null;

    protected readonly Math     = Math;
    protected readonly rotatePt = rotatePt;
    protected readonly svgRect  = (tl: {x: number; y: number}, tr: {x: number; y: number},
                                   br: {x: number; y: number}, bl: {x: number; y: number}) =>
        `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

    readonly corners = computed(() => {
        const b = this.box();
        if (!b) return [];
        const pad = 10;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const rad = this.rotation() * Math.PI / 180;
        return [
            {id: 'nw' as const, lx: b.x - pad,      ly: b.y - pad,       cursor: 'nw-resize'},
            {id: 'ne' as const, lx: b.x + b.w + pad, ly: b.y - pad,       cursor: 'ne-resize'},
            {id: 'se' as const, lx: b.x + b.w + pad, ly: b.y + b.h + pad, cursor: 'se-resize'},
            {id: 'sw' as const, lx: b.x - pad,       ly: b.y + b.h + pad, cursor: 'sw-resize'},
        ].map(r => {const p = rotatePt(r.lx, r.ly, cx, cy, rad); return {...r, x: p.x, y: p.y};});
    });

    readonly sides = computed(() => {
        const b = this.box();
        if (!b) return [];
        const pad = 10;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const rad = this.rotation() * Math.PI / 180;
        return [
            {id: 'n' as const, lx: b.x + b.w / 2,    ly: b.y - pad,       cursor: 'n-resize'},
            {id: 's' as const, lx: b.x + b.w / 2,    ly: b.y + b.h + pad, cursor: 's-resize'},
            {id: 'e' as const, lx: b.x + b.w + pad,  ly: b.y + b.h / 2,   cursor: 'e-resize'},
            {id: 'w' as const, lx: b.x - pad,         ly: b.y + b.h / 2,   cursor: 'w-resize'},
        ].map(r => {const p = rotatePt(r.lx, r.ly, cx, cy, rad); return {...r, x: p.x, y: p.y};});
    });

    onHandleDown(ev: PointerEvent, handle: HandleDragEvent['handle']): void {
        ev.preventDefault();
        ev.stopPropagation();
        this.activeHandle = handle;
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;

        const canvasEl   = (ev.target as HTMLElement).closest('[data-canvas-overlay]')?.parentElement ?? null;
        const canvasRect = canvasEl?.getBoundingClientRect() ?? null;

        if (handle === 'rotate' && canvasRect) {
            const b = this.box()!;
            this.lastAngle = Math.atan2(ev.clientY - (canvasRect.top + b.y + b.h / 2), ev.clientX - (canvasRect.left + b.x + b.w / 2));
        }

        const onMove = (e: PointerEvent) => {
            if (!this.activeHandle) return;
            if (this.activeHandle === 'rotate' && canvasRect) {
                const b     = this.box()!;
                const angle = Math.atan2(e.clientY - (canvasRect.top + b.y + b.h / 2), e.clientX - (canvasRect.left + b.x + b.w / 2));
                let delta   = (angle - this.lastAngle) * (180 / Math.PI);
                if (delta >  180) delta -= 360;
                if (delta < -180) delta += 360;
                this.lastAngle = angle;
                if (Math.abs(delta) > 0.05) this.handleDrag.emit({handle: 'rotate', dx: delta, dy: 0, done: false});
                return;
            }
            const screenDx = e.clientX - this.lastX;
            const screenDy = e.clientY - this.lastY;
            this.lastX = e.clientX; this.lastY = e.clientY;
            if (Math.abs(screenDx) < 0.5 && Math.abs(screenDy) < 0.5) return;
            const rad     = -this.rotation() * Math.PI / 180;
            const cos     = Math.cos(rad), sin = Math.sin(rad);
            this.handleDrag.emit({handle: this.activeHandle, dx: screenDx * cos - screenDy * sin, dy: screenDx * sin + screenDy * cos, done: false});
        };
        const onUp = () => {
            if (this.activeHandle) this.handleDrag.emit({handle: this.activeHandle, dx: 0, dy: 0, done: true});
            this.activeHandle = null;
            cleanup();
        };
        const cleanup = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup',  onUp);
            this.cleanupPtr = null;
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup',  onUp);
        this.cleanupPtr = cleanup;
    }

    ngOnDestroy(): void {this.cleanupPtr?.();}
}
