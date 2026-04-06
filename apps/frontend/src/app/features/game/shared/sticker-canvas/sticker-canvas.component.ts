import {
    Component,
    input,
    output,
    signal,
    effect,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";
import {pointInPolygon} from "./sticker-hit-test.util";
import {StickerGestureHandler} from "./sticker-gesture-handler";
import {renderCanvasToDataUrl} from "./sticker-canvas-renderer.util";

@Component({
    selector: "app-sticker-canvas",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-canvas.component.html",
    host: {style: "display: block; width: 100%; height: 100%;"},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {
    // ── Inputs / Outputs ──────────────────────────────────────────
    readonly stickers        = input<StickerPlacement[]>([]);
    readonly stickerCatalog  = input<StickerDefinition[]>([]);
    readonly maxStickers     = input<number>(20);
    readonly interactive     = input<boolean>(false);

    readonly placementsChanged = output<StickerPlacement[]>();
    readonly stickerRemoved    = output<string>();

    @ViewChild("canvasArea") private canvasArea!: ElementRef<HTMLDivElement>;

    public get canvasNativeElement(): HTMLDivElement | null {
        return this.canvasArea?.nativeElement ?? null;
    }

    // ── View state ────────────────────────────────────────────────
    public readonly selectedInstanceId = signal<string | null>(null);
    public readonly lassoSelection     = signal<Set<string>>(new Set());
    public readonly lassoPath          = signal<{x: number; y: number}[] | null>(null);

    // ── Internals ─────────────────────────────────────────────────
    private catalogMap             = new Map<string, StickerDefinition>();
    private gesture!: StickerGestureHandler;
    private removeTouchListeners: (() => void) | null = null;

    constructor() {
        // Rebuild catalog map whenever stickerCatalog input changes
        effect(() => {
            const catalog = this.stickerCatalog();
            this.catalogMap.clear();
            for (const s of catalog) this.catalogMap.set(s.id, s);
        });

        // Keep gesture handler in sync whenever stickers change
        effect(() => {
            const stickers = this.stickers();
            this.gesture?.syncState(stickers, this.selectedInstanceId(), this.lassoSelection());
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    ngAfterViewInit(): void {
        this.gesture = new StickerGestureHandler(
            () => this.canvasArea.nativeElement.getBoundingClientRect(),
            (cx, cy) => this.hitTestSticker(cx, cy),
            (instanceId) => this.getRenderedSize(instanceId),
            {
                onPlacementsChanged: (p) => this.placementsChanged.emit(p),
                onLassoPathChanged:  (p) => this.lassoPath.set(p),
                onLassoSelectionChanged: (ids) => this.lassoSelection.set(ids),
                onSelectedChanged:   (id) => this.selectedInstanceId.set(id),
            },
        );
        if (this.interactive()) this.installTouchListeners();
    }

    ngOnDestroy(): void {
        this.removeTouchListeners?.();
    }

    // ── Public API ────────────────────────────────────────────────

    /** Renders the canvas contents to a PNG data URL at 2× resolution. */
    public toDataUrl(): Promise<string> {
        return renderCanvasToDataUrl(
            this.canvasArea.nativeElement,
            this.stickers(),
            (id) => this.getStickerUrl(id),
        );
    }

    public generateInstanceId(): string {
        return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // ── Template helpers ──────────────────────────────────────────

    public getStickerUrl(stickerId: string): string {
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getHitboxSvgPoints(stickerId: string): string {
        const def = this.catalogMap.get(stickerId);
        if (!def?.hitboxPolygon || def.hitboxPolygon.length < 3) return "";
        return def.hitboxPolygon.map(p => `${p.x},${p.y}`).join(" ");
    }

    public isSelected(instanceId: string): boolean {
        return this.selectedInstanceId() === instanceId || this.lassoSelection().has(instanceId);
    }

    public isLassoSelected(instanceId: string): boolean {
        return this.lassoSelection().has(instanceId);
    }

    public lassoSvgPath(): string {
        const path = this.lassoPath();
        if (!path || path.length < 2) return "";
        return "M " + path.map(p => `${p.x} ${p.y}`).join(" L ");
    }

    // ── Toolbar actions ───────────────────────────────────────────

    public rotateSelected(degrees: number): void {
        const ids = this.selectionIds();
        if (!ids.length) return;
        this.emit(this.stickers().map(p =>
            ids.includes(p.instanceId) ? {...p, rotation: p.rotation + degrees} : p,
        ));
    }

    public scaleSelected(factor: number): void {
        const ids = this.selectionIds();
        if (!ids.length) return;
        this.emit(this.stickers().map(p =>
            ids.includes(p.instanceId)
                ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))}
                : p,
        ));
    }

    public removeSelected(): void {
        const group = this.lassoSelection();
        if (group.size > 0) {
            this.lassoSelection.set(new Set());
            this.emit(this.stickers().filter(p => !group.has(p.instanceId)));
            return;
        }
        const id = this.selectedInstanceId();
        if (!id) return;
        this.selectedInstanceId.set(null);
        this.stickerRemoved.emit(id);
    }

    public bringForward(): void   { this.swapZ(+1); }
    public sendBackward(): void   { this.swapZ(-1); }

    // ── Private ───────────────────────────────────────────────────


    private selectionIds(): string[] {
        const grp = this.lassoSelection();
        if (grp.size > 0) return [...grp];
        const s = this.selectedInstanceId();
        return s ? [s] : [];
    }

    private emit(updated: StickerPlacement[]): void {
        this.placementsChanged.emit(updated);
    }

    private swapZ(direction: 1 | -1): void {
        const id = this.selectedInstanceId();
        if (!id) return;
        const sorted = [...this.stickers()].sort((a, b) => a.zIndex - b.zIndex);
        const idx = sorted.findIndex(p => p.instanceId === id);
        const neighbor = sorted[idx + direction];
        if (!neighbor) return;
        const current = sorted[idx];
        this.emit(this.stickers().map(p => {
            if (p.instanceId === id)                  return {...p, zIndex: neighbor.zIndex};
            if (p.instanceId === neighbor.instanceId) return {...p, zIndex: current.zIndex};
            return p;
        }));
    }

    /** Returns the un-scaled rendered image dimensions for a placed sticker. */
    private getRenderedSize(instanceId: string): {w: number; h: number} {
        const img = this.canvasArea?.nativeElement.querySelector(
            `[data-instance-id="${instanceId}"] img`,
        ) as HTMLImageElement | null;
        return {w: img?.offsetWidth ?? 64, h: img?.offsetHeight ?? 64};
    }

    private hitTestSticker(clientX: number, clientY: number): string | null {
        const rect   = this.canvasArea.nativeElement.getBoundingClientRect();
        const sorted = [...this.stickers()].sort((a, b) => b.zIndex - a.zIndex);

        for (const p of sorted) {
            const {w: imgW, h: imgH} = this.getRenderedSize(p.instanceId);
            if (imgW === 0 || imgH === 0) continue;

            const scaledW = imgW * p.scale;
            const scaledH = imgH * p.scale;
            const cx      = p.x + scaledW / 2 + rect.left;
            const cy      = p.y + scaledH / 2 + rect.top;

            // Rotate click point into sticker's local space
            const dx  = clientX - cx;
            const dy  = clientY - cy;
            const rad = (-p.rotation * Math.PI) / 180;
            const rx  = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ry  = dx * Math.sin(rad) + dy * Math.cos(rad);

            const localX = (rx + scaledW / 2) / scaledW;
            const localY = (ry + scaledH / 2) / scaledH;
            if (localX < 0 || localX > 1 || localY < 0 || localY > 1) continue;

            const def = this.catalogMap.get(p.stickerId);
            if (def?.hitboxPolygon && def.hitboxPolygon.length >= 3) {
                if (pointInPolygon(localX, localY, def.hitboxPolygon)) return p.instanceId;
                continue;
            }
            return p.instanceId;
        }
        return null;
    }

    // ── Touch / pointer event wiring ──────────────────────────────

    private installTouchListeners(): void {
        const el = this.canvasArea.nativeElement;
        el.style.touchAction = "none";
        (el.style as any).webkitTouchCallout = "none";
        (el.style as any).webkitUserSelect   = "none";

        const isToolbar = (ev: Event) =>
            !!(ev.target as HTMLElement).closest("[data-canvas-toolbar]");

        const onTouchStart = (ev: TouchEvent) => {
            if (isToolbar(ev)) return;
            ev.preventDefault();
            this.syncGesture();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerDown(t.identifier, t.clientX, t.clientY);
        };
        const onTouchMove = (ev: TouchEvent) => {
            ev.preventDefault();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerMove(t.identifier, t.clientX, t.clientY);
        };
        const onTouchEnd = (ev: TouchEvent) => {
            ev.preventDefault();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerUp(t.identifier, t.clientX, t.clientY);
        };

        let cleanupMouse: (() => void) | null = null;
        const onMouseDown = (ev: MouseEvent) => {
            if (ev.button !== 0 || isToolbar(ev)) return;
            ev.preventDefault();
            this.syncGesture();
            this.gesture.onPointerDown(-1, ev.clientX, ev.clientY);
            const onMove = (e: MouseEvent) => { e.preventDefault(); this.gesture.onPointerMove(-1, e.clientX, e.clientY); };
            const onUp   = (e: MouseEvent) => {
                this.gesture.onPointerUp(-1, e.clientX, e.clientY);
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                cleanupMouse = null;
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup",   onUp);
            cleanupMouse = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
        };

        el.addEventListener("touchstart",  onTouchStart, {passive: false});
        el.addEventListener("touchmove",   onTouchMove,  {passive: false});
        el.addEventListener("touchend",    onTouchEnd,   {passive: false});
        el.addEventListener("touchcancel", onTouchEnd,   {passive: false});
        el.addEventListener("mousedown",   onMouseDown);

        this.removeTouchListeners = () => {
            el.removeEventListener("touchstart",  onTouchStart as EventListener);
            el.removeEventListener("touchmove",   onTouchMove  as EventListener);
            el.removeEventListener("touchend",    onTouchEnd   as EventListener);
            el.removeEventListener("touchcancel", onTouchEnd   as EventListener);
            el.removeEventListener("mousedown",   onMouseDown);
            cleanupMouse?.();
        };
    }

    /** Keeps the gesture handler's snapshot in sync before each gesture starts. */
    private syncGesture(): void {
        this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
    }
}
