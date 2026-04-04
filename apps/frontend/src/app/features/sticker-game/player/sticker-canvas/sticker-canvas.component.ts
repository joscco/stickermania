import {
    Component,
    EventEmitter,
    Input,
    Output,
    signal,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";

interface ActivePointer {
    id: number;
    x: number;
    y: number;
}

/**
 * Interactive sticker canvas with proper touch gesture handling.
 *
 * - **One finger on a sticker**: drag to reposition
 * - **Two fingers on a sticker**: pinch to scale, rotate by angle between fingers
 * - **Tap on empty area**: deselect
 *
 * Touch events are intercepted with `{ passive: false }` and `preventDefault()`
 * to prevent Safari from interpreting them as scroll / zoom / back-gestures.
 */
@Component({
    selector: "app-sticker-canvas",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-canvas.component.html",
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {
    @Input() stickers: StickerPlacement[] = [];
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() maxStickers: number = 12;
    @Input() interactive: boolean = false;
    @Output() placementsChanged = new EventEmitter<StickerPlacement[]>();
    @Output() stickerRemoved = new EventEmitter<string>();

    @ViewChild("canvasArea") canvasArea!: ElementRef<HTMLDivElement>;

    public readonly selectedInstanceId = signal<string | null>(null);

    // ── Gesture state ────────────────────────────────────────────

    private pointers: ActivePointer[] = [];
    private dragInstanceId: string | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;

    /** Two-finger gesture baseline values */
    private pinchBaseDistance = 0;
    private pinchBaseAngle = 0;
    private pinchBaseScale = 1;
    private pinchBaseRotation = 0;
    private pinchBaseCenterX = 0;
    private pinchBaseCenterY = 0;
    private pinchBaseX = 0;
    private pinchBaseY = 0;

    /** Tap detection */
    private tapStartX = 0;
    private tapStartY = 0;
    private tapStartTime = 0;
    private tapMoved = false;

    private removeTouchHandlers: (() => void) | null = null;
    private catalogMap = new Map<string, StickerDefinition>();

    // ── Lifecycle ────────────────────────────────────────────────

    ngAfterViewInit(): void {
        this.buildCatalogMap();
        if (this.interactive) {
            this.installTouchHandlers();
        }
    }

    ngOnDestroy(): void {
        this.removeTouchHandlers?.();
    }

    // ── Catalog ──────────────────────────────────────────────────

    private buildCatalogMap(): void {
        this.catalogMap.clear();
        for (const s of this.stickerCatalog) {
            this.catalogMap.set(s.id, s);
        }
    }

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.buildCatalogMap();
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    // ── Touch handler installation (Safari-safe) ─────────────────
    //
    // We install touch listeners directly on the element with
    // { passive: false } to intercept ALL touch events before Safari
    // can interpret them as scroll, pinch-to-zoom, or swipe-back.

    private installTouchHandlers(): void {
        const el = this.canvasArea?.nativeElement;
        if (!el) {
          return;
        }

        // Disable any native touch behavior
        el.style.touchAction = "none";
        // Prevent iOS "callout" (long-press menu)
        (el.style as any).webkitTouchCallout = "none";   // eslint-disable-line @typescript-eslint/no-explicit-any
        (el.style as any).webkitUserSelect = "none";      // eslint-disable-line @typescript-eslint/no-explicit-any

        const onTouchStart = (ev: TouchEvent): void => {
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches)) {
                this.handlePointerDown(t.identifier, t.clientX, t.clientY);
            }
        };

        const onTouchMove = (ev: TouchEvent): void => {
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches)) {
                this.handlePointerMove(t.identifier, t.clientX, t.clientY);
            }
        };

        const onTouchEnd = (ev: TouchEvent): void => {
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches)) {
                this.handlePointerUp(t.identifier, t.clientX, t.clientY);
            }
        };

        // Mouse fallback for desktop
        let removeMouseListeners: (() => void) | null = null;
        const onMouseDown = (ev: MouseEvent): void => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            this.handlePointerDown(-1, ev.clientX, ev.clientY);
            const onMouseMove = (mev: MouseEvent): void => {
                mev.preventDefault();
                this.handlePointerMove(-1, mev.clientX, mev.clientY);
            };
            const onMouseUp = (mev: MouseEvent): void => {
                this.handlePointerUp(-1, mev.clientX, mev.clientY);
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                removeMouseListeners = null;
            };
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            removeMouseListeners = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };
        };

        el.addEventListener("touchstart", onTouchStart, {passive: false});
        el.addEventListener("touchmove", onTouchMove, {passive: false});
        el.addEventListener("touchend", onTouchEnd, {passive: false});
        el.addEventListener("touchcancel", onTouchEnd, {passive: false});
        el.addEventListener("mousedown", onMouseDown);

        this.removeTouchHandlers = () => {
            el.removeEventListener("touchstart", onTouchStart as EventListener);
            el.removeEventListener("touchmove", onTouchMove as EventListener);
            el.removeEventListener("touchend", onTouchEnd as EventListener);
            el.removeEventListener("touchcancel", onTouchEnd as EventListener);
            el.removeEventListener("mousedown", onMouseDown);
            removeMouseListeners?.();
        };
    }

    // ── Core gesture logic ───────────────────────────────────────

    private handlePointerDown(id: number, clientX: number, clientY: number): void {
        this.pointers.push({id, x: clientX, y: clientY});

        if (this.pointers.length === 1) {
            // First finger: start drag or tap
            this.tapStartX = clientX;
            this.tapStartY = clientY;
            this.tapStartTime = performance.now();
            this.tapMoved = false;

            const instanceId = this.hitTestSticker(clientX, clientY);
            if (instanceId) {
                this.selectedInstanceId.set(instanceId);
                this.dragInstanceId = instanceId;

                const placement = this.stickers.find(p => p.instanceId === instanceId);
                if (placement) {
                    const rect = this.canvasArea.nativeElement.getBoundingClientRect();
                    this.dragOffsetX = clientX - rect.left - placement.x;
                    this.dragOffsetY = clientY - rect.top - placement.y;

                    // Bring to front
                    const maxZ = Math.max(0, ...this.stickers.map(p => p.zIndex));
                    if (placement.zIndex < maxZ) {
                        this.emitUpdate(this.stickers.map(p =>
                            p.instanceId === instanceId ? {...p, zIndex: maxZ + 1} : p
                        ));
                    }
                }
            } else {
                this.dragInstanceId = null;
            }
        }

        if (this.pointers.length === 2 && this.dragInstanceId) {
            // Second finger arrived: start pinch/rotate on the selected sticker
            this.tapMoved = true; // prevent tap
            this.initPinchBaseline();
        }
    }

    private handlePointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};

        // Tap detection
        if (!this.tapMoved) {
            const dx = clientX - this.tapStartX;
            const dy = clientY - this.tapStartY;
            if (Math.hypot(dx, dy) > 8) {
                this.tapMoved = true;
            }
        }

        if (this.pointers.length === 2 && this.dragInstanceId) {
            // Two-finger: pinch to scale + rotate
            this.applyPinch();
        } else if (this.pointers.length === 1 && this.dragInstanceId) {
            // One-finger drag
            const rect = this.canvasArea.nativeElement.getBoundingClientRect();
            const newX = clientX - rect.left - this.dragOffsetX;
            const newY = clientY - rect.top - this.dragOffsetY;
            this.emitUpdate(this.stickers.map(p =>
                p.instanceId === this.dragInstanceId ? {...p, x: newX, y: newY} : p
            ));
        }
    }

    private handlePointerUp(id: number, _clientX: number, _clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);

        if (this.pointers.length === 0) {
            // Check for tap
            const duration = performance.now() - this.tapStartTime;
            if (!this.tapMoved && duration < 300) {
                if (!this.dragInstanceId) {
                    // Tapped on empty area → deselect
                    this.selectedInstanceId.set(null);
                }
                // Tapped on a sticker → it's already selected from pointerDown
            }
            this.dragInstanceId = null;
        }

        if (this.pointers.length === 1 && this.dragInstanceId) {
            // Went from 2 → 1 finger: re-anchor drag from the remaining finger
            const remaining = this.pointers[0];
            const placement = this.stickers.find(p => p.instanceId === this.dragInstanceId);
            if (placement) {
                const rect = this.canvasArea.nativeElement.getBoundingClientRect();
                this.dragOffsetX = remaining.x - rect.left - placement.x;
                this.dragOffsetY = remaining.y - rect.top - placement.y;
            }
        }
    }

    // ── Pinch / rotate ───────────────────────────────────────────

    private initPinchBaseline(): void {
        if (this.pointers.length < 2) return;
        const [a, b] = this.pointers;
        this.pinchBaseDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.pinchBaseAngle = Math.atan2(b.y - a.y, b.x - a.x);
        this.pinchBaseCenterX = (a.x + b.x) / 2;
        this.pinchBaseCenterY = (a.y + b.y) / 2;

        const placement = this.stickers.find(p => p.instanceId === this.dragInstanceId);
        if (placement) {
            this.pinchBaseScale = placement.scale;
            this.pinchBaseRotation = placement.rotation;
            this.pinchBaseX = placement.x;
            this.pinchBaseY = placement.y;
        }
    }

    private applyPinch(): void {
        if (this.pointers.length < 2 || !this.dragInstanceId) return;
        const [a, b] = this.pointers;

        const newDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const newAngle = Math.atan2(b.y - a.y, b.x - a.x);

        const scaleFactor = newDist / this.pinchBaseDistance;
        const angleDelta = (newAngle - this.pinchBaseAngle) * (180 / Math.PI);

        // Center delta for panning during pinch
        const newCenterX = (a.x + b.x) / 2;
        const newCenterY = (a.y + b.y) / 2;
        const centerDx = newCenterX - this.pinchBaseCenterX;
        const centerDy = newCenterY - this.pinchBaseCenterY;

        const newScale = Math.max(0.2, Math.min(4, this.pinchBaseScale * scaleFactor));
        const newRotation = this.pinchBaseRotation + angleDelta;
        const newX = this.pinchBaseX + centerDx;
        const newY = this.pinchBaseY + centerDy;

        this.emitUpdate(this.stickers.map(p =>
            p.instanceId === this.dragInstanceId
                ? {...p, scale: newScale, rotation: newRotation, x: newX, y: newY}
                : p
        ));
    }

    // ── Hit testing ──────────────────────────────────────────────

    private hitTestSticker(clientX: number, clientY: number): string | null {
        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        // Test from highest z-index to lowest
        const sorted = [...this.stickers].sort((a, b) => b.zIndex - a.zIndex);
        const hitSize = 64; // matches w-16 h-16

        for (const p of sorted) {
            const halfW = (hitSize * p.scale) / 2;
            const halfH = (hitSize * p.scale) / 2;
            const cx = p.x + halfW;
            const cy = p.y + halfH;

            if (localX >= cx - halfW && localX <= cx + halfW &&
                localY >= cy - halfH && localY <= cy + halfH) {
                return p.instanceId;
            }
        }
        return null;
    }

    // ── Toolbar actions ──────────────────────────────────────────

    public rotateSelected(degrees: number): void {
        const id = this.selectedInstanceId();
        if (!id) {
          return;
        }
        this.emitUpdate(this.stickers.map(p =>
            p.instanceId === id ? {...p, rotation: p.rotation + degrees} : p
        ));
    }

    public scaleSelected(factor: number): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        this.emitUpdate(this.stickers.map(p =>
            p.instanceId === id ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))} : p
        ));
    }

    public duplicateSelected(): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        if (this.stickers.length >= this.maxStickers) return;
        const source = this.stickers.find(p => p.instanceId === id);
        if (!source) return;
        const maxZ = Math.max(0, ...this.stickers.map(p => p.zIndex));
        const newPlacement: StickerPlacement = {
            instanceId: this.generateInstanceId(),
            stickerId: source.stickerId,
            x: source.x + 20,
            y: source.y + 20,
            rotation: source.rotation,
            scale: source.scale,
            zIndex: maxZ + 1,
        };
        this.emitUpdate([...this.stickers, newPlacement]);
        this.selectedInstanceId.set(newPlacement.instanceId);
    }

    public removeSelected(): void {
        const id = this.selectedInstanceId();
        if (!id) {
          return;
        }
        this.selectedInstanceId.set(null);
        this.stickerRemoved.emit(id);
    }

    // ── Helpers ──────────────────────────────────────────────────

    private emitUpdate(updated: StickerPlacement[]): void {
        this.placementsChanged.emit(updated);
    }

    public generateInstanceId(): string {
        return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
}
