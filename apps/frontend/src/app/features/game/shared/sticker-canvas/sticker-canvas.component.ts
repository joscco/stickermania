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
import {pointInPolygon} from "./sticker-hit-test.util";

interface ActivePointer { id: number; x: number; y: number; }

/** Baseline snapshot for a single sticker during a group-transform gesture */
interface GroupBaseline {
    instanceId: string;
    baseX: number;
    baseY: number;
    baseScale: number;
    baseRotation: number;
    /** vector from gesture-center to sticker center at gesture start */
    relCx: number;
    relCy: number;
}

/**
 * Interactive sticker canvas:
 * - 1 finger on sticker → drag
 * - 2 fingers anywhere (with sticker selected) → pinch/rotate selected sticker
 * - 1 finger on empty area → start lasso selection
 * - Lasso confirms → multi-select; then 1 finger drags group, 2 fingers transforms group
 * - Toolbar: z-order, rotate, scale, delete
 */
@Component({
    selector: "app-sticker-canvas",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-canvas.component.html",
    host: { style: "display: block; width: 100%; height: 100%;" },
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {
    @Input() stickers: StickerPlacement[] = [];
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() maxStickers: number = 20;
    @Input() interactive: boolean = false;
    @Output() placementsChanged = new EventEmitter<StickerPlacement[]>();
    @Output() stickerRemoved = new EventEmitter<string>();
    @Output() stickerDropped = new EventEmitter<{stickerId: string; x: number; y: number}>();

    @ViewChild("canvasArea") private canvasArea!: ElementRef<HTMLDivElement>;

    /** The inner canvas element — use this as the drop target for external drag sources. */
    public get canvasNativeElement(): HTMLDivElement | null {
        return this.canvasArea?.nativeElement ?? null;
    }

    public readonly selectedInstanceId = signal<string | null>(null);
    /** Set of instanceIds currently in the lasso selection */
    public readonly lassoSelection = signal<Set<string>>(new Set());
    /** Lasso rect in canvas-local px, null when not drawing */
    public readonly lassoRect = signal<{x: number; y: number; w: number; h: number} | null>(null);

    // ── Gesture state ────────────────────────────────────────────
    private pointers: ActivePointer[] = [];
    private dragInstanceId: string | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;

    /** true when dragging a lasso */
    private lassoActive = false;
    private lassoStartX = 0;
    private lassoStartY = 0;

    /** true when dragging the lasso-selected group with one finger */
    private groupDragActive = false;
    private groupDragOffsetX = 0;
    private groupDragOffsetY = 0;
    /** Per-sticker baseline for group drag (anchor = pointer-down position) */
    private groupDragBaselines: {instanceId: string; baseX: number; baseY: number}[] = [];

    /** Two-finger gesture baseline values */
    private pinchBaseDistance = 0;
    private pinchBaseAngle = 0;
    private pinchBaseCenterX = 0;
    private pinchBaseCenterY = 0;
    /** Baselines for all stickers involved in pinch (single or group) */
    private pinchGroupBaselines: GroupBaseline[] = [];

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
        if (this.interactive) this.installTouchHandlers();
    }

    ngOnDestroy(): void {
        this.removeTouchHandlers?.();
    }

    // ── Snapshot ─────────────────────────────────────────────────

    /**
     * Render the sticker canvas to a PNG data URL using native Canvas 2D API.
     * The canvas is always square, so we use its width as the definitive size.
     */
    public async toDataUrl(): Promise<string> {
        const el = this.canvasArea.nativeElement;
        const size = el.clientWidth; // square → width === height
        const pixelScale = 2; // 2× for good quality

        const canvas = document.createElement("canvas");
        canvas.width = size * pixelScale;
        canvas.height = size * pixelScale;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(pixelScale, pixelScale);

        // Transparent background (no fill)

        // Pre-load all sticker images
        const imageCache = new Map<string, HTMLImageElement>();
        await Promise.all(
            this.stickers.map(p => {
                const url = this.getStickerUrl(p.stickerId);
                if (!url || imageCache.has(url)) return Promise.resolve();
                return new Promise<void>((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => { imageCache.set(url, img); resolve(); };
                    img.onerror = () => resolve();
                    img.src = url;
                });
            }),
        );

        // Sort by z-index (lowest first = painted behind)
        const sorted = [...this.stickers].sort((a, b) => a.zIndex - b.zIndex);

        for (const placement of sorted) {
            const url = this.getStickerUrl(placement.stickerId);
            const img = imageCache.get(url);
            if (!img) continue;

            // Read the actual rendered size from the DOM (h-16 w-auto → aspect preserved)
            const domImg = el.querySelector(
                `[data-instance-id="${placement.instanceId}"] img`,
            ) as HTMLImageElement | null;
            const drawW = domImg ? domImg.offsetWidth : 64;
            const drawH = domImg ? domImg.offsetHeight : 64;

            // CSS transform-origin: center center on the unscaled box
            const cx = placement.x + drawW / 2;
            const cy = placement.y + drawH / 2;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((placement.rotation * Math.PI) / 180);
            ctx.scale(placement.scale, placement.scale);
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
        }

        console.log("[toDataUrl] rendered", sorted.length, "stickers to", canvas.width, "×", canvas.height);
        return canvas.toDataURL("image/png");
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

    /**
     * Returns the SVG polygon `points` attribute string for a sticker's hitbox,
     * using normalised 0–1 coordinates. Returns empty string if no polygon hitbox.
     */
    public getHitboxSvgPoints(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.buildCatalogMap();
        }
        const def = this.catalogMap.get(stickerId);
        if (!def?.hitboxPolygon || def.hitboxPolygon.length < 3) return "";
        return def.hitboxPolygon.map(p => `${p.x},${p.y}`).join(" ");
    }

    /** Whether a given instanceId is in the lasso selection */
    public isLassoSelected(instanceId: string): boolean {
        return this.lassoSelection().has(instanceId);
    }

    // ── Touch handler installation ───────────────────────────────

    private installTouchHandlers(): void {
        const el = this.canvasArea?.nativeElement;
        if (!el) return;

        el.style.touchAction = "none";
        (el.style as any).webkitTouchCallout = "none";
        (el.style as any).webkitUserSelect = "none";

        const isToolbarClick = (ev: Event): boolean =>
            !!(ev.target as HTMLElement).closest("[data-canvas-toolbar]");

        const onTouchStart = (ev: TouchEvent): void => {
            if (isToolbarClick(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerDown(t.identifier, t.clientX, t.clientY);
        };
        const onTouchMove = (ev: TouchEvent): void => {
            if (this.pointers.length === 0) return;
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerMove(t.identifier, t.clientX, t.clientY);
        };
        const onTouchEnd = (ev: TouchEvent): void => {
            if (this.pointers.length === 0) return;
            ev.preventDefault();
            ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerUp(t.identifier, t.clientX, t.clientY);
        };

        let removeMouseListeners: (() => void) | null = null;
        const onMouseDown = (ev: MouseEvent): void => {
            if (ev.button !== 0 || isToolbarClick(ev)) return;
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

        // ── Second finger → always start pinch on whatever is selected / in group ──
        if (this.pointers.length === 2) {
            this.tapMoved = true;
            this.lassoActive = false;
            this.lassoRect.set(null);

            const hasGroup = this.lassoSelection().size > 1;
            const hasSingle = !!this.selectedInstanceId() && !hasGroup;

            if (hasGroup || hasSingle) {
                // Determine which stickers to pinch
                const ids = hasGroup
                    ? [...this.lassoSelection()]
                    : [this.selectedInstanceId()!];
                // Ensure dragInstanceId is set so applyPinch knows what to target
                if (hasSingle) this.dragInstanceId = this.selectedInstanceId();
                this.initPinchBaseline(ids);
            }
            return;
        }

        // ── First finger ──────────────────────────────────────────
        this.tapStartX = clientX;
        this.tapStartY = clientY;
        this.tapStartTime = performance.now();
        this.tapMoved = false;

        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        const hitId = this.hitTestSticker(clientX, clientY);

        // If we have a lasso group and the finger is on one of them → start group drag
        if (!hitId && this.lassoSelection().size > 1) {
            // Tap outside group → clear group
            this.lassoSelection.set(new Set());
            this.selectedInstanceId.set(null);
            this.dragInstanceId = null;
        } else if (hitId && this.lassoSelection().size > 1 && this.lassoSelection().has(hitId)) {
            // Start group drag
            this.groupDragActive = true;
            this.groupDragBaselines = this.stickers
                .filter(p => this.lassoSelection().has(p.instanceId))
                .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
            this.groupDragOffsetX = localX;
            this.groupDragOffsetY = localY;
            this.dragInstanceId = hitId; // used as anchor for pinch
        } else if (hitId) {
            // Single sticker select + drag
            this.lassoSelection.set(new Set());
            this.selectedInstanceId.set(hitId);
            this.dragInstanceId = hitId;
            const placement = this.stickers.find(p => p.instanceId === hitId);
            if (placement) {
                this.dragOffsetX = localX - placement.x;
                this.dragOffsetY = localY - placement.y;
            }
        } else {
            // Empty area → start lasso
            this.selectedInstanceId.set(null);
            this.lassoSelection.set(new Set());
            this.dragInstanceId = null;
            this.lassoActive = true;
            this.lassoStartX = localX;
            this.lassoStartY = localY;
            this.lassoRect.set({x: localX, y: localY, w: 0, h: 0});
        }
    }

    private handlePointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};

        if (!this.tapMoved) {
            const dx = clientX - this.tapStartX;
            const dy = clientY - this.tapStartY;
            if (Math.hypot(dx, dy) > 8) this.tapMoved = true;
        }

        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        // ── Two-finger pinch ──────────────────────────────────────
        if (this.pointers.length === 2 && this.pinchGroupBaselines.length > 0) {
            this.applyPinch();
            return;
        }

        // ── Group drag ────────────────────────────────────────────
        if (this.groupDragActive && this.pointers.length === 1) {
            const dx = localX - this.groupDragOffsetX;
            const dy = localY - this.groupDragOffsetY;
            this.emitUpdate(this.stickers.map(p => {
                const base = this.groupDragBaselines.find(b => b.instanceId === p.instanceId);
                if (!base) return p;
                return {...p, x: base.baseX + dx, y: base.baseY + dy};
            }));
            return;
        }

        // ── Single sticker drag ───────────────────────────────────
        if (this.pointers.length === 1 && this.dragInstanceId && !this.groupDragActive) {
            const newX = localX - this.dragOffsetX;
            const newY = localY - this.dragOffsetY;
            this.emitUpdate(this.stickers.map(p =>
                p.instanceId === this.dragInstanceId ? {...p, x: newX, y: newY} : p
            ));
            return;
        }

        // ── Lasso drawing ─────────────────────────────────────────
        if (this.lassoActive && this.pointers.length === 1) {
            const x = Math.min(localX, this.lassoStartX);
            const y = Math.min(localY, this.lassoStartY);
            const w = Math.abs(localX - this.lassoStartX);
            const h = Math.abs(localY - this.lassoStartY);
            this.lassoRect.set({x, y, w, h});
        }
    }

    private handlePointerUp(id: number, _clientX: number, _clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);

        if (this.pointers.length === 0) {
            // ── Finalise lasso ──────────────────────────────────
            if (this.lassoActive) {
                const rect = this.lassoRect();
                if (rect && (rect.w > 8 || rect.h > 8)) {
                    const selected = this.stickers.filter(p => this.stickerIntersectsLasso(p, rect));
                    if (selected.length > 1) {
                        this.lassoSelection.set(new Set(selected.map(p => p.instanceId)));
                        this.selectedInstanceId.set(null);
                    } else if (selected.length === 1) {
                        this.selectedInstanceId.set(selected[0].instanceId);
                        this.lassoSelection.set(new Set());
                    }
                }
                this.lassoRect.set(null);
                this.lassoActive = false;
            }

            // ── Tap detection ───────────────────────────────────
            const duration = performance.now() - this.tapStartTime;
            if (!this.tapMoved && duration < 300 && !this.dragInstanceId && !this.groupDragActive) {
                this.selectedInstanceId.set(null);
                this.lassoSelection.set(new Set());
            }

            this.dragInstanceId = null;
            this.groupDragActive = false;
            this.groupDragBaselines = [];
            this.pinchGroupBaselines = [];
        }

        // Re-anchor single drag if going 2→1 finger
        if (this.pointers.length === 1 && this.dragInstanceId && !this.groupDragActive) {
            const remaining = this.pointers[0];
            const placement = this.stickers.find(p => p.instanceId === this.dragInstanceId);
            if (placement) {
                const rect = this.canvasArea.nativeElement.getBoundingClientRect();
                this.dragOffsetX = remaining.x - rect.left - placement.x;
                this.dragOffsetY = remaining.y - rect.top - placement.y;
            }
            this.pinchGroupBaselines = [];
        }

        // Re-anchor group drag if going 2→1 finger
        if (this.pointers.length === 1 && this.groupDragActive) {
            const remaining = this.pointers[0];
            const rect = this.canvasArea.nativeElement.getBoundingClientRect();
            this.groupDragOffsetX = remaining.x - rect.left;
            this.groupDragOffsetY = remaining.y - rect.top;
            this.groupDragBaselines = this.stickers
                .filter(p => this.lassoSelection().has(p.instanceId))
                .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
            this.pinchGroupBaselines = [];
        }
    }

    // ── Pinch / rotate ───────────────────────────────────────────

    /**
     * Initialise pinch baseline for a set of sticker instanceIds.
     * The gesture center is the midpoint of the two active pointers.
     */
    private initPinchBaseline(ids: string[]): void {
        if (this.pointers.length < 2) return;
        const [a, b] = this.pointers;
        this.pinchBaseDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.pinchBaseAngle = Math.atan2(b.y - a.y, b.x - a.x);
        this.pinchBaseCenterX = (a.x + b.x) / 2;
        this.pinchBaseCenterY = (a.y + b.y) / 2;

        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const canvasCx = this.pinchBaseCenterX - rect.left;
        const canvasCy = this.pinchBaseCenterY - rect.top;

        this.pinchGroupBaselines = ids
            .map(iid => this.stickers.find(p => p.instanceId === iid))
            .filter(Boolean)
            .map(p => {
                const img = this.canvasArea.nativeElement.querySelector(
                    `[data-instance-id="${p!.instanceId}"] img`
                ) as HTMLImageElement | null;
                const imgW = (img?.offsetWidth ?? 64) * p!.scale;
                const imgH = (img?.offsetHeight ?? 64) * p!.scale;
                return {
                    instanceId: p!.instanceId,
                    baseX: p!.x,
                    baseY: p!.y,
                    baseScale: p!.scale,
                    baseRotation: p!.rotation,
                    relCx: (p!.x + imgW / 2) - canvasCx,
                    relCy: (p!.y + imgH / 2) - canvasCy,
                } as GroupBaseline;
            });
    }

    private applyPinch(): void {
        if (this.pointers.length < 2 || this.pinchGroupBaselines.length === 0) return;
        const [a, b] = this.pointers;

        const newDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const newAngle = Math.atan2(b.y - a.y, b.x - a.x);
        const scaleFactor = newDist / this.pinchBaseDistance;
        const angleDelta = (newAngle - this.pinchBaseAngle) * (180 / Math.PI);
        const angleRad = (newAngle - this.pinchBaseAngle);

        const newCenterX = (a.x + b.x) / 2;
        const newCenterY = (a.y + b.y) / 2;
        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const canvasCx = newCenterX - rect.left;
        const canvasCy = newCenterY - rect.top;

        this.emitUpdate(this.stickers.map(p => {
            const base = this.pinchGroupBaselines.find(b => b.instanceId === p.instanceId);
            if (!base) return p;

            const newScale = Math.max(0.2, Math.min(4, base.baseScale * scaleFactor));
            const newRotation = base.baseRotation + angleDelta;

            // Rotate the relative center vector
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            const newRelCx = (base.relCx * cos - base.relCy * sin) * scaleFactor;
            const newRelCy = (base.relCx * sin + base.relCy * cos) * scaleFactor;

            const img = this.canvasArea.nativeElement.querySelector(
                `[data-instance-id="${p.instanceId}"] img`
            ) as HTMLImageElement | null;
            const imgW = (img?.offsetWidth ?? 64) * newScale;
            const imgH = (img?.offsetHeight ?? 64) * newScale;

            const newX = canvasCx + newRelCx - imgW / 2;
            const newY = canvasCy + newRelCy - imgH / 2;

            return {...p, scale: newScale, rotation: newRotation, x: newX, y: newY};
        }));
    }

    // ── Lasso hit detection ──────────────────────────────────────

    private stickerIntersectsLasso(
        placement: StickerPlacement,
        lasso: {x: number; y: number; w: number; h: number},
    ): boolean {
        const el = this.canvasArea.nativeElement.querySelector(
            `[data-instance-id="${placement.instanceId}"] img`
        ) as HTMLImageElement | null;
        const imgW = (el?.offsetWidth ?? 64) * placement.scale;
        const imgH = (el?.offsetHeight ?? 64) * placement.scale;

        // Sticker bounding box (axis-aligned, ignoring rotation for simplicity)
        const sx = placement.x;
        const sy = placement.y;
        return sx < lasso.x + lasso.w &&
               sx + imgW > lasso.x &&
               sy < lasso.y + lasso.h &&
               sy + imgH > lasso.y;
    }

    // ── Hit testing ──────────────────────────────────────────────

    private hitTestSticker(clientX: number, clientY: number): string | null {
        if (this.catalogMap.size !== this.stickerCatalog.length) this.buildCatalogMap();

        const sorted = [...this.stickers].sort((a, b) => b.zIndex - a.zIndex);
        for (const placement of sorted) {
            const el = this.canvasArea.nativeElement.querySelector(
                `[data-instance-id="${placement.instanceId}"]`
            ) as HTMLElement | null;
            if (!el) continue;
            const img = el.querySelector("img");
            if (!img) continue;
            const imgW = img.offsetWidth;
            const imgH = img.offsetHeight;
            if (imgW === 0 || imgH === 0) continue;

            const scaledW = imgW * placement.scale;
            const scaledH = imgH * placement.scale;
            const cx = placement.x + scaledW / 2;
            const cy = placement.y + scaledH / 2;

            const rect = this.canvasArea.nativeElement.getBoundingClientRect();
            const clickX = clientX - rect.left;
            const clickY = clientY - rect.top;

            let dx = clickX - cx;
            let dy = clickY - cy;
            const rad = (-placement.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;

            const localX = (rx + scaledW / 2) / scaledW;
            const localY = (ry + scaledH / 2) / scaledH;
            if (localX < 0 || localX > 1 || localY < 0 || localY > 1) continue;

            const def = this.catalogMap.get(placement.stickerId);
            if (def?.hitboxPolygon && def.hitboxPolygon.length >= 3) {
                if (pointInPolygon(localX, localY, def.hitboxPolygon)) return placement.instanceId;
                continue;
            }
            return placement.instanceId;
        }
        return null;
    }

    // ── Z-Index controls ─────────────────────────────────────────

    public bringForward(): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        const current = this.stickers.find(p => p.instanceId === id);
        if (!current) return;
        const sorted = [...this.stickers].sort((a, b) => a.zIndex - b.zIndex);
        const currentIdx = sorted.findIndex(p => p.instanceId === id);
        if (currentIdx < sorted.length - 1) {
            const above = sorted[currentIdx + 1];
            this.emitUpdate(this.stickers.map(p => {
                if (p.instanceId === id) return {...p, zIndex: above.zIndex};
                if (p.instanceId === above.instanceId) return {...p, zIndex: current.zIndex};
                return p;
            }));
        }
    }

    public sendBackward(): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        const current = this.stickers.find(p => p.instanceId === id);
        if (!current) return;
        const sorted = [...this.stickers].sort((a, b) => a.zIndex - b.zIndex);
        const currentIdx = sorted.findIndex(p => p.instanceId === id);
        if (currentIdx > 0) {
            const below = sorted[currentIdx - 1];
            this.emitUpdate(this.stickers.map(p => {
                if (p.instanceId === id) return {...p, zIndex: below.zIndex};
                if (p.instanceId === below.instanceId) return {...p, zIndex: current.zIndex};
                return p;
            }));
        }
    }

    public bringToFront(): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        const maxZ = Math.max(0, ...this.stickers.map(p => p.zIndex));
        this.emitUpdate(this.stickers.map(p => p.instanceId === id ? {...p, zIndex: maxZ + 1} : p));
    }

    public sendToBack(): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        const minZ = Math.min(0, ...this.stickers.map(p => p.zIndex));
        this.emitUpdate(this.stickers.map(p => p.instanceId === id ? {...p, zIndex: minZ - 1} : p));
    }

    // ── Toolbar actions ──────────────────────────────────────────

    public rotateSelected(degrees: number): void {
        const id = this.selectedInstanceId();
        const group = this.lassoSelection();
        const ids = group.size > 1 ? [...group] : id ? [id] : [];
        if (ids.length === 0) return;
        this.emitUpdate(this.stickers.map(p =>
            ids.includes(p.instanceId) ? {...p, rotation: p.rotation + degrees} : p
        ));
    }

    public scaleSelected(factor: number): void {
        const id = this.selectedInstanceId();
        const group = this.lassoSelection();
        const ids = group.size > 1 ? [...group] : id ? [id] : [];
        if (ids.length === 0) return;
        this.emitUpdate(this.stickers.map(p =>
            ids.includes(p.instanceId)
                ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))}
                : p
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
        const group = this.lassoSelection();
        if (group.size > 1) {
            // Remove all in group
            const ids = new Set(group);
            this.lassoSelection.set(new Set());
            this.emitUpdate(this.stickers.filter(p => !ids.has(p.instanceId)));
            return;
        }
        if (!id) return;
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

    // ── Legacy drag & drop (desktop fallback, kept for compatibility) ──
    public onDragOver(event: DragEvent): void {
        if (event.dataTransfer?.types.includes("application/x-sticker-id")) {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }
    }

    public onDrop(event: DragEvent): void {
        const stickerId = event.dataTransfer?.getData("application/x-sticker-id");
        if (!stickerId) return;
        event.preventDefault();
        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const x = event.clientX - rect.left - 32;
        const y = event.clientY - rect.top - 32;

        this.stickerDropped.emit({stickerId, x: Math.max(0, x), y: Math.max(0, y)});
    }
}
