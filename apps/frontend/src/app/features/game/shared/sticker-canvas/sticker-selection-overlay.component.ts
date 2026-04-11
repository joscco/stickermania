import {
    Component, input, output, computed, OnDestroy,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {BoundingBox} from '../sticker-editor/sticker-editor-state';

export interface HandleDragEvent {
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'rotate' | 'n' | 's' | 'e' | 'w';
    dx: number;
    dy: number;
    done: boolean;
}

/** Rotate a point [x,y] around [cx,cy] by `rad` radians. */
function rotatePt(x: number, y: number, cx: number, cy: number, rad: number): {x: number; y: number} {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return {x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos};
}

@Component({
    selector: 'app-sticker-selection-overlay',
    standalone: true,
    imports: [CommonModule],
    template: `
    @if (box()) {
      @let b   = box()!;
      @let pad = 10;
      @let cx  = b.x + b.w / 2;
      @let cy  = b.y + b.h / 2;
      @let rad = rotation() * Math.PI / 180;

      <!-- Selection rectangle (rotated around sticker center) -->
      @let tl = rotatePt(b.x - pad,       b.y - pad,       cx, cy, rad);
      @let tr = rotatePt(b.x + b.w + pad, b.y - pad,       cx, cy, rad);
      @let br = rotatePt(b.x + b.w + pad, b.y + b.h + pad, cx, cy, rad);
      @let bl = rotatePt(b.x - pad,       b.y + b.h + pad, cx, cy, rad);
      <svg class="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style="z-index:8000;">
        <polygon
          [attr.points]="svgRect(tl,tr,br,bl)"
          fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="6 3"
        />
      </svg>

      <!-- Rotation handle — sits above the top-center edge, along local Y axis -->
      @let rotAnchor = rotatePt(cx, b.y - pad - 24, cx, cy, rad);
      @let rotStem0  = rotatePt(cx, b.y - pad,      cx, cy, rad);
      <svg class="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style="z-index:8050;">
        <line
          [attr.x1]="rotStem0.x" [attr.y1]="rotStem0.y"
          [attr.x2]="rotAnchor.x" [attr.y2]="rotAnchor.y"
          stroke="#a855f7" stroke-width="2"
        />
      </svg>
      <div
        class="absolute select-none touch-none"
        [style.left.px]="rotAnchor.x - 8"
        [style.top.px]="rotAnchor.y - 8"
        style="z-index:8100; cursor:grab; pointer-events:auto;"
        (pointerdown)="onHandleDown($event, 'rotate')"
      >
        <div class="w-4 h-4 rounded-full bg-white border-2 border-purple-500 shadow"
             style="box-shadow:0 1px 4px rgba(0,0,0,.2);"></div>
      </div>

      <!-- Corner handles -->
      @for (corner of corners(); track corner.id) {
        <div
          class="absolute w-4 h-4 bg-white border-2 border-purple-500 rounded shadow select-none touch-none"
          [style.left.px]="corner.x - 8"
          [style.top.px]="corner.y - 8"
          [style.cursor]="corner.cursor"
          style="z-index:8100; pointer-events:auto;"
          (pointerdown)="onHandleDown($event, corner.id)"
        ></div>
      }

      <!-- Stretch side handles (only in stretch mode) -->
      @if (stretchMode()) {
        @for (side of sides(); track side.id) {
          <div
            class="absolute w-3.5 h-3.5 bg-amber-400 border-2 border-amber-600 rounded-full shadow select-none touch-none"
            [style.left.px]="side.x - 7"
            [style.top.px]="side.y - 7"
            [style.cursor]="side.cursor"
            style="z-index:8100; pointer-events:auto;"
            (pointerdown)="onHandleDown($event, side.id)"
          ></div>
        }
        <div
          class="absolute pointer-events-none text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
          [style.left.px]="b.x" [style.top.px]="b.y - pad - 44"
          style="z-index:8200;"
        >Verformen</div>
      }

      <!-- Context-menu toggle -->
      @let menuPt = rotatePt(b.x + b.w + pad + 4, b.y - pad, cx, cy, rad);
      <div
        class="absolute flex items-center justify-center w-7 h-7 rounded-full bg-white border border-black/12 shadow text-stone-500 select-none touch-none cursor-pointer"
        [style.left.px]="menuPt.x"
        [style.top.px]="menuPt.y - 14"
        style="z-index:8200; pointer-events:auto;"
        title="Optionen"
        (pointerdown)="$event.stopPropagation(); menuToggle.emit()"
      >
        <svg viewBox="0 0 16 16" class="w-4 h-4" fill="currentColor">
          <circle cx="8" cy="3" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="13" r="1.3"/>
        </svg>
      </div>
    }
  `,
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
    private lastAngle = 0;   // for rotation handle: track angle from sticker center
    private cleanupPtr: (() => void) | null = null;

    // Expose Math/helpers to template
    protected readonly Math      = Math;
    protected readonly rotatePt  = rotatePt;
    protected readonly svgRect   = (tl: {x:number;y:number}, tr: {x:number;y:number},
                                    br: {x:number;y:number}, bl: {x:number;y:number}) =>
        `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

    readonly corners = computed(() => {
        const b = this.box();
        if (!b) return [];
        const pad = 10;
        const cx  = b.x + b.w / 2, cy = b.y + b.h / 2;
        const rad = this.rotation() * Math.PI / 180;
        const raw = [
            {id: 'nw' as const, lx: b.x - pad,       ly: b.y - pad,       cursor: 'nw-resize'},
            {id: 'ne' as const, lx: b.x + b.w + pad,  ly: b.y - pad,       cursor: 'ne-resize'},
            {id: 'se' as const, lx: b.x + b.w + pad,  ly: b.y + b.h + pad, cursor: 'se-resize'},
            {id: 'sw' as const, lx: b.x - pad,        ly: b.y + b.h + pad, cursor: 'sw-resize'},
        ];
        return raw.map(r => {
            const p = rotatePt(r.lx, r.ly, cx, cy, rad);
            return {...r, x: p.x, y: p.y};
        });
    });

    readonly sides = computed(() => {
        const b = this.box();
        if (!b) return [];
        const pad = 10;
        const cx  = b.x + b.w / 2, cy = b.y + b.h / 2;
        const rad = this.rotation() * Math.PI / 180;
        const raw = [
            {id: 'n' as const, lx: b.x + b.w / 2,    ly: b.y - pad,       cursor: 'n-resize'},
            {id: 's' as const, lx: b.x + b.w / 2,    ly: b.y + b.h + pad, cursor: 's-resize'},
            {id: 'e' as const, lx: b.x + b.w + pad,  ly: b.y + b.h / 2,   cursor: 'e-resize'},
            {id: 'w' as const, lx: b.x - pad,        ly: b.y + b.h / 2,   cursor: 'w-resize'},
        ];
        return raw.map(r => {
            const p = rotatePt(r.lx, r.ly, cx, cy, rad);
            return {...r, x: p.x, y: p.y};
        });
    });

    onHandleDown(ev: PointerEvent, handle: HandleDragEvent['handle']): void {
        ev.preventDefault();
        ev.stopPropagation();
        this.activeHandle = handle;
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;

        // For rotation: get the canvas element to convert client → canvas coords
        const canvasEl = (ev.target as HTMLElement).closest('[data-canvas-overlay]')
                           ?.parentElement ?? null;
        const canvasRect = canvasEl?.getBoundingClientRect() ?? null;

        if (handle === 'rotate' && canvasRect) {
            const b  = this.box()!;
            const cx = canvasRect.left + b.x + b.w / 2;
            const cy = canvasRect.top  + b.y + b.h / 2;
            this.lastAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        }

        const onMove = (e: PointerEvent) => {
            if (!this.activeHandle) return;

            if (this.activeHandle === 'rotate' && canvasRect) {
                const b    = this.box()!;
                const cx   = canvasRect.left + b.x + b.w / 2;
                const cy   = canvasRect.top  + b.y + b.h / 2;
                const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
                let delta   = (angle - this.lastAngle) * (180 / Math.PI);
                // Wrap to [-180, 180]
                if (delta >  180) delta -= 360;
                if (delta < -180) delta += 360;
                this.lastAngle = angle;
                if (Math.abs(delta) > 0.05)
                    this.handleDrag.emit({handle: 'rotate', dx: delta, dy: 0, done: false});
                return;
            }

            // Scale / stretch handles: unrotate screen delta to local sticker space
            const screenDx = e.clientX - this.lastX;
            const screenDy = e.clientY - this.lastY;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            if (Math.abs(screenDx) < 0.5 && Math.abs(screenDy) < 0.5) return;
            const rad     = -this.rotation() * Math.PI / 180;
            const cos     = Math.cos(rad), sin = Math.sin(rad);
            const localDx = screenDx * cos - screenDy * sin;
            const localDy = screenDx * sin + screenDy * cos;
            this.handleDrag.emit({handle: this.activeHandle, dx: localDx, dy: localDy, done: false});
        };
        const onUp = (_e: PointerEvent) => {
            if (this.activeHandle)
                this.handleDrag.emit({handle: this.activeHandle, dx: 0, dy: 0, done: true});
            this.activeHandle = null;
            cleanup();
        };
        const cleanup = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup',   onUp);
            this.cleanupPtr = null;
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup',   onUp);
        this.cleanupPtr = cleanup;
    }

    ngOnDestroy(): void { this.cleanupPtr?.(); }
}

