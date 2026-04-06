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

interface GroupBaseline {
    instanceId: string;
    baseX: number;
    baseY: number;
    baseScale: number;
    baseRotation: number;
    relCx: number;
    relCy: number;
}

/**
 * Interactive sticker canvas — simplified interaction model:
 *
 * IDLE (nothing selected):
 *   - tap sticker            → select it
 *   - drag on empty area     → draw freehand lasso
 *
 * SELECTION ACTIVE (single or group):
 *   - 1 finger anywhere      → move selection (no need to touch sticker)
 *   - 2 fingers anywhere     → pinch-scale + rotate selection
 *   - tap empty area         → deselect
 *   - tap different sticker  → select that one instead
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

    public get canvasNativeElement(): HTMLDivElement | null {
        return this.canvasArea?.nativeElement ?? null;
    }

    public readonly selectedInstanceId = signal<string | null>(null);
    public readonly lassoSelection = signal<Set<string>>(new Set());
    /** Freehand lasso path points (canvas-local px), null when not drawing */
    public readonly lassoPath = signal<{x: number; y: number}[] | null>(null);

    // ── Interaction state ────────────────────────────────────────
    private pointers: ActivePointer[] = [];

    // Lasso
    private lassoActive = false;

    // Drag / move selection
    private moveActive = false;
    private moveOffsetX = 0;
    private moveOffsetY = 0;
    private moveBaselines: {instanceId: string; baseX: number; baseY: number}[] = [];

    // Pinch
    private pinchBaseDistance = 0;
    private pinchBaseAngle = 0;
    private pinchGroupBaselines: GroupBaseline[] = [];

    // Tap detection
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

    public isLassoSelected(instanceId: string): boolean {
        return this.lassoSelection().has(instanceId);
    }

    public isSelected(instanceId: string): boolean {
        return this.selectedInstanceId() === instanceId || this.lassoSelection().has(instanceId);
    }

    /** Converts the freehand lasso path to an SVG `d` attribute string. */
    public lassoSvgPath(): string {
        const path = this.lassoPath();
        if (!path || path.length < 2) return "";
        return "M " + path.map(p => `${p.x} ${p.y}`).join(" L ");
    }

    // ── Touch handler installation ───────────────────────────────

    private installTouchHandlers(): void {
        const el = this.canvasArea?.nativeElement;
        if (!el) return;

        el.style.touchAction = "none";
        (el.style as any).webkitTouchCallout = "none";
        (el.style as any).webkitUserSelect = "none";

        const isToolbar = (ev: Event) =>
            !!(ev.target as HTMLElement).closest("[data-canvas-toolbar]");

        const onTouchStart = (ev: TouchEvent) => {
            if (isToolbar(ev)) return;
            ev.preventDefault(); ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerDown(t.identifier, t.clientX, t.clientY);
        };
        const onTouchMove = (ev: TouchEvent) => {
            if (this.pointers.length === 0) return;
            ev.preventDefault(); ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerMove(t.identifier, t.clientX, t.clientY);
        };
        const onTouchEnd = (ev: TouchEvent) => {
            if (this.pointers.length === 0) return;
            ev.preventDefault(); ev.stopPropagation();
            for (const t of Array.from(ev.changedTouches))
                this.handlePointerUp(t.identifier, t.clientX, t.clientY);
        };

        let removeMouseListeners: (() => void) | null = null;
        const onMouseDown = (ev: MouseEvent) => {
            if (ev.button !== 0 || isToolbar(ev)) return;
            ev.preventDefault();
            this.handlePointerDown(-1, ev.clientX, ev.clientY);
            const onMouseMove = (mev: MouseEvent) => {
                mev.preventDefault();
                this.handlePointerMove(-1, mev.clientX, mev.clientY);
            };
            const onMouseUp = (mev: MouseEvent) => {
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
        el.addEventListener("touchmove",  onTouchMove,  {passive: false});
        el.addEventListener("touchend",   onTouchEnd,   {passive: false});
        el.addEventListener("touchcancel",onTouchEnd,   {passive: false});
        el.addEventListener("mousedown",  onMouseDown);

        this.removeTouchHandlers = () => {
            el.removeEventListener("touchstart",  onTouchStart as EventListener);
            el.removeEventListener("touchmove",   onTouchMove  as EventListener);
            el.removeEventListener("touchend",    onTouchEnd   as EventListener);
            el.removeEventListener("touchcancel", onTouchEnd   as EventListener);
            el.removeEventListener("mousedown",   onMouseDown);
            removeMouseListeners?.();
        };
    }

    // ── Core gesture logic ───────────────────────────────────────

    private hasSelection(): boolean {
        return !!this.selectedInstanceId() || this.lassoSelection().size > 0;
    }

    private selectedIds(): string[] {
        const grp = this.lassoSelection();
        if (grp.size > 0) return [...grp];
        const s = this.selectedInstanceId();
        return s ? [s] : [];
    }

    private handlePointerDown(id: number, clientX: number, clientY: number): void {
        this.pointers.push({id, x: clientX, y: clientY});

        // ── Second finger: always upgrade to pinch ────────────────
        if (this.pointers.length === 2) {
            this.tapMoved = true;
            this.lassoActive = false;
            this.lassoPath.set(null);
            this.moveActive = false;

            const ids = this.selectedIds();
            if (ids.length > 0) this.initPinchBaseline(ids);
            return;
        }

        // ── First finger ──────────────────────────────────────────
        this.tapStartX    = clientX;
        this.tapStartY    = clientY;
        this.tapStartTime = performance.now();
        this.tapMoved     = false;

        const rect   = this.canvasArea.nativeElement.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const hitId  = this.hitTestSticker(clientX, clientY);

        if (this.hasSelection()) {
            // ── Selection mode: any finger moves/transforms the selection ──
            if (hitId && !this.isSelected(hitId)) {
                // Tapped a different sticker → select it
                this.lassoSelection.set(new Set());
                this.selectedInstanceId.set(hitId);
            }
            // Start move regardless of where finger lands
            this.startMove(localX, localY);
        } else if (hitId) {
            // ── No selection, hit a sticker → select + start move ──
            this.selectedInstanceId.set(hitId);
            this.lassoSelection.set(new Set());
            this.startMove(localX, localY);
        } else {
            // ── Empty area, no selection → draw lasso ────────────
            this.lassoActive = true;
            this.lassoPath.set([{x: localX, y: localY}]);
        }
    }

    private startMove(localX: number, localY: number): void {
        this.moveActive   = true;
        this.moveOffsetX  = localX;
        this.moveOffsetY  = localY;
        this.moveBaselines = this.stickers
            .filter(p => this.isSelected(p.instanceId))
            .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
    }

    private handlePointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};

        if (!this.tapMoved) {
            const dx = clientX - this.tapStartX;
            const dy = clientY - this.tapStartY;
            if (Math.hypot(dx, dy) > 6) this.tapMoved = true;
        }

        const rect   = this.canvasArea.nativeElement.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        // ── Two-finger pinch ──────────────────────────────────────
        if (this.pointers.length === 2 && this.pinchGroupBaselines.length > 0) {
            this.applyPinch();
            return;
        }

        // ── Move selection ────────────────────────────────────────
        if (this.moveActive && this.pointers.length === 1) {
            const dx = localX - this.moveOffsetX;
            const dy = localY - this.moveOffsetY;
            this.emitUpdate(this.stickers.map(p => {
                const base = this.moveBaselines.find(b => b.instanceId === p.instanceId);
                return base ? {...p, x: base.baseX + dx, y: base.baseY + dy} : p;
            }));
            return;
        }

        // ── Lasso drawing ─────────────────────────────────────────
        if (this.lassoActive && this.pointers.length === 1) {
            const path = this.lassoPath() ?? [];
            this.lassoPath.set([...path, {x: localX, y: localY}]);
        }
    }

    private handlePointerUp(id: number, clientX: number, clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);

        if (this.pointers.length === 0) {
            // ── Finalise lasso ──────────────────────────────────
            if (this.lassoActive) {
                const path = this.lassoPath();
                if (path && path.length > 3) {
                    const selected = this.stickers.filter(p => this.stickerInLassoPath(p, path));
                    if (selected.length > 1) {
                        this.lassoSelection.set(new Set(selected.map(p => p.instanceId)));
                        this.selectedInstanceId.set(null);
                    } else if (selected.length === 1) {
                        this.selectedInstanceId.set(selected[0].instanceId);
                        this.lassoSelection.set(new Set());
                    }
                }
                this.lassoPath.set(null);
                this.lassoActive = false;
            }

            // ── Tap on empty → deselect ─────────────────────────
            const elapsed = performance.now() - this.tapStartTime;
            if (!this.tapMoved && elapsed < 300) {
                const hitId = this.hitTestSticker(clientX, clientY);
                if (!hitId) {
                    this.selectedInstanceId.set(null);
                    this.lassoSelection.set(new Set());
                }
            }

            this.moveActive        = false;
            this.moveBaselines     = [];
            this.pinchGroupBaselines = [];
        }

        // Re-anchor move if going 2→1 finger
        if (this.pointers.length === 1 && this.moveActive) {
            const remaining = this.pointers[0];
            const rect = this.canvasArea.nativeElement.getBoundingClientRect();
            this.moveOffsetX  = remaining.x - rect.left;
            this.moveOffsetY  = remaining.y - rect.top;
            this.moveBaselines = this.stickers
                .filter(p => this.isSelected(p.instanceId))
                .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
            this.pinchGroupBaselines = [];
        }
    }

    // ── Pinch / rotate ───────────────────────────────────────────

    private initPinchBaseline(ids: string[]): void {
        if (this.pointers.length < 2) return;
        const [a, b] = this.pointers;
        this.pinchBaseDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.pinchBaseAngle    = Math.atan2(b.y - a.y, b.x - a.x);

        const rect      = this.canvasArea.nativeElement.getBoundingClientRect();
        const canvasCx  = ((a.x + b.x) / 2) - rect.left;
        const canvasCy  = ((a.y + b.y) / 2) - rect.top;

        this.pinchGroupBaselines = ids
            .map(iid => this.stickers.find(p => p.instanceId === iid))
            .filter(Boolean)
            .map(p => {
                const img = this.canvasArea.nativeElement.querySelector(
                    `[data-instance-id="${p!.instanceId}"] img`
                ) as HTMLImageElement | null;
                const imgW = (img?.offsetWidth  ?? 64) * p!.scale;
                const imgH = (img?.offsetHeight ?? 64) * p!.scale;
                return {
                    instanceId:   p!.instanceId,
                    baseX:        p!.x,
                    baseY:        p!.y,
                    baseScale:    p!.scale,
                    baseRotation: p!.rotation,
                    relCx: (p!.x + imgW / 2) - canvasCx,
                    relCy: (p!.y + imgH / 2) - canvasCy,
                } as GroupBaseline;
            });
    }

    private applyPinch(): void {
        if (this.pointers.length < 2 || this.pinchGroupBaselines.length === 0) return;
        const [a, b] = this.pointers;

        const newDist    = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const newAngle   = Math.atan2(b.y - a.y, b.x - a.x);
        const scaleFactor = newDist / this.pinchBaseDistance;
        const angleDelta  = (newAngle - this.pinchBaseAngle) * (180 / Math.PI);
        const angleRad    = newAngle - this.pinchBaseAngle;

        const rect     = this.canvasArea.nativeElement.getBoundingClientRect();
        const canvasCx = ((a.x + b.x) / 2) - rect.left;
        const canvasCy = ((a.y + b.y) / 2) - rect.top;

        this.emitUpdate(this.stickers.map(p => {
            const base = this.pinchGroupBaselines.find(b => b.instanceId === p.instanceId);
            if (!base) return p;

            const newScale    = Math.max(0.2, Math.min(4, base.baseScale * scaleFactor));
            const newRotation = base.baseRotation + angleDelta;

            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            const newRelCx = (base.relCx * cos - base.relCy * sin) * scaleFactor;
            const newRelCy = (base.relCx * sin + base.relCy * cos) * scaleFactor;

            const img  = this.canvasArea.nativeElement.querySelector(
                `[data-instance-id="${p.instanceId}"] img`
            ) as HTMLImageElement | null;
            const imgW = (img?.offsetWidth  ?? 64) * newScale;
            const imgH = (img?.offsetHeight ?? 64) * newScale;

            return {
                ...p,
                scale:    newScale,
                rotation: newRotation,
                x: canvasCx + newRelCx - imgW / 2,
                y: canvasCy + newRelCy - imgH / 2,
            };
        }));
    }

    // ── Lasso hit detection (point-in-polygon) ───────────────────

    private stickerInLassoPath(
        placement: StickerPlacement,
        path: {x: number; y: number}[],
    ): boolean {
        const el = this.canvasArea.nativeElement.querySelector(
            `[data-instance-id="${placement.instanceId}"] img`
        ) as HTMLImageElement | null;
        const imgW = (el?.offsetWidth  ?? 64) * placement.scale;
        const imgH = (el?.offsetHeight ?? 64) * placement.scale;

        // Check if the sticker's centre is inside the lasso polygon
        const cx = placement.x + imgW / 2;
        const cy = placement.y + imgH / 2;
        return pointInPolygon(cx, cy, path);
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
            const img = el.querySelector("img") as HTMLImageElement | null;
            if (!img) continue;
            const imgW = img.offsetWidth;
            const imgH = img.offsetHeight;
            if (imgW === 0 || imgH === 0) continue;

            const scaledW = imgW * placement.scale;
            const scaledH = imgH * placement.scale;
            const rect    = this.canvasArea.nativeElement.getBoundingClientRect();
            const cx      = placement.x + scaledW / 2 + rect.left;
            const cy      = placement.y + scaledH / 2 + rect.top;

            let dx = clientX - cx;
            let dy = clientY - cy;
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
        const idx = sorted.findIndex(p => p.instanceId === id);
        if (idx < sorted.length - 1) {
            const above = sorted[idx + 1];
            this.emitUpdate(this.stickers.map(p => {
                if (p.instanceId === id)           return {...p, zIndex: above.zIndex};
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
        const idx = sorted.findIndex(p => p.instanceId === id);
        if (idx > 0) {
            const below = sorted[idx - 1];
            this.emitUpdate(this.stickers.map(p => {
                if (p.instanceId === id)            return {...p, zIndex: below.zIndex};
                if (p.instanceId === below.instanceId) return {...p, zIndex: current.zIndex};
                return p;
            }));
        }
    }

    // ── Toolbar actions ──────────────────────────────────────────

    public rotateSelected(degrees: number): void {
        const ids = this.selectedIds();
        if (!ids.length) return;
        this.emitUpdate(this.stickers.map(p =>
            ids.includes(p.instanceId) ? {...p, rotation: p.rotation + degrees} : p
        ));
    }

    public scaleSelected(factor: number): void {
        const ids = this.selectedIds();
        if (!ids.length) return;
        this.emitUpdate(this.stickers.map(p =>
            ids.includes(p.instanceId)
                ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))}
                : p
        ));
    }

    public removeSelected(): void {
        const grp = this.lassoSelection();
        if (grp.size > 1) {
            const ids = new Set(grp);
            this.lassoSelection.set(new Set());
            this.emitUpdate(this.stickers.filter(p => !ids.has(p.instanceId)));
            return;
        }
        const id = this.selectedInstanceId();
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
}
