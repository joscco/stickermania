import {
    Component, input, output, signal, computed, effect,
    ElementRef, ViewChild, AfterViewInit, OnDestroy,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import gsap from 'gsap';
import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {pointInPolygon} from './sticker-hit-test.util';
import {StickerGestureHandler} from './sticker-gesture-handler';
import {renderCanvasToDataUrl} from './sticker-canvas-renderer.util';
import {StickerSelectionOverlayComponent, type HandleDragEvent} from './sticker-selection-overlay.component';
import {StickerContextMenuComponent, type ContextMenuAction} from '../sticker-shared/sticker-context-menu.component';
import {StickerUndoStack} from '../sticker-shared/sticker-undo-stack';
import type {BoundingBox} from '../sticker-shared/sticker-types';
import * as ops from '../sticker-shared/sticker-placement-ops';

@Component({
    selector: 'app-sticker-canvas',
    standalone: true,
    imports: [CommonModule, StickerSelectionOverlayComponent, StickerContextMenuComponent],
    templateUrl: './sticker-canvas.component.html',
    host: {style: 'display: block; width: 100%; height: 100%;'},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {

    // ── Inputs / Outputs ──────────────────────────────────────────────────────

    readonly stickers       = input<StickerPlacement[]>([]);
    readonly stickerCatalog = input<StickerDefinition[]>([]);
    readonly maxStickers    = input<number>(20);
    readonly interactive    = input<boolean>(false);

    readonly placementsChanged = output<StickerPlacement[]>();
    readonly stickerRemoved    = output<string>();

    @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;
    @ViewChild('deleteZone') private deleteZone!: ElementRef<HTMLDivElement>;

    get canvasNativeElement(): HTMLDivElement | null {
        return this.canvasArea?.nativeElement ?? null;
    }

    // ── Selection state ───────────────────────────────────────────────────────

    readonly selectedInstanceId = signal<string | null>(null);
    readonly lassoSelection     = signal<Set<string>>(new Set());
    readonly stretchMode        = signal<boolean>(false);
    readonly menuVisible        = signal<boolean>(false);

    readonly hasSelection     = computed(() => !!this.selectedInstanceId() || this.lassoSelection().size > 0);
    readonly isMultiSelection = computed(() => this.lassoSelection().size > 1);
    readonly selectionIds     = computed<string[]>(() => {
        const s = this.lassoSelection();
        if (s.size > 0) return [...s];
        const id = this.selectedInstanceId();
        return id ? [id] : [];
    });

    // ── Undo ─────────────────────────────────────────────────────────────────

    readonly undo = new StickerUndoStack();

    // ── Visual state ──────────────────────────────────────────────────────────

    readonly lassoPath    = signal<{x: number; y: number}[] | null>(null);
    readonly lassoPoints  = computed(() => this.lassoPath()?.map(p => `${p.x},${p.y}`).join(' '));
    readonly dragNearEdge = signal<boolean>(false);
    readonly canvasW      = signal(400);
    readonly canvasH      = signal(400);

    // ── Selection geometry (drives overlay + context menu) ────────────────────

    readonly selectionInfo = computed<{box: BoundingBox; rotation: number} | null>(() => {
        const ids = this.selectionIds();
        if (!ids.length) return null;
        const placements = this.stickers().filter(p => ids.includes(p.instanceId));
        if (!placements.length) return null;

        if (ids.length === 1) {
            const p  = placements[0];
            const pp = p as any;
            const {w, h} = this.getRenderedSize(p.instanceId);
            const hw = w * p.scale * (pp.scaleX ?? 1) / 2;
            const hh = h * p.scale * (pp.scaleY ?? 1) / 2;
            return {box: {x: p.x - hw, y: p.y - hh, w: hw * 2, h: hh * 2}, rotation: p.rotation};
        }

        // Multi: axis-aligned envelope of all rotated corners
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of placements) {
            const pp = p as any;
            const {w, h} = this.getRenderedSize(p.instanceId);
            const hw  = w * p.scale * (pp.scaleX ?? 1) / 2;
            const hh  = h * p.scale * (pp.scaleY ?? 1) / 2;
            const rad = p.rotation * Math.PI / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            for (const [ex, ey] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]) {
                const rx = p.x + ex * cos - ey * sin;
                const ry = p.y + ex * sin + ey * cos;
                if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
                if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
            }
        }
        return {box: {x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, rotation: 0};
    });

    readonly boundingBox = computed<BoundingBox | null>(() => this.selectionInfo()?.box ?? null);
    readonly menuAnchorX = computed(() => (this.selectionInfo()?.box.x ?? 0) + (this.selectionInfo()?.box.w ?? 0) + 14);
    readonly menuAnchorY = computed(() => (this.boundingBox()?.y ?? 0) + (this.boundingBox()?.h ?? 0) + 6);

    // ── Group helpers (for context menu) ─────────────────────────────────────

    readonly canGroup = computed(() => {
        const ids = this.selectionIds();
        if (ids.length < 2) return false;
        const all   = this.stickers();
        const first = all.find(p => p.instanceId === ids[0]);
        return !first?.groupId || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
    });

    readonly canUngroup = computed(() =>
        this.stickers().some(p => this.selectionIds().includes(p.instanceId) && !!p.groupId),
    );

    // ── Internals ─────────────────────────────────────────────────────────────

    private catalogMap              = new Map<string, StickerDefinition>();
    private gesture!:                 StickerGestureHandler;
    private removeTouchListeners:    (() => void) | null = null;
    private resizeObserver:          ResizeObserver      | null = null;
    private readonly removingIds     = new Set<string>();

    constructor() {
        effect(() => {
            this.catalogMap.clear();
            for (const s of this.stickerCatalog()) this.catalogMap.set(s.id, s);
        });
        effect(() => {
            this.gesture?.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
        });
        effect(() => {
            const el = this.deleteZone?.nativeElement;
            if (!el) return;
            const near = this.dragNearEdge();
            gsap.to(el, {opacity: near ? 1 : 0, duration: near ? 0.18 : 0.12, ease: near ? 'power2.out' : 'power2.in', overwrite: true});
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    ngAfterViewInit(): void {
        this.gesture = new StickerGestureHandler(
            () => this.canvasArea.nativeElement.getBoundingClientRect(),
            (cx, cy) => this.hitTestSticker(cx, cy),
            (id) => this.getRenderedSize(id),
            {
                onPlacementsChanged:     (p) => this.placementsChanged.emit(p),
                onLassoPathChanged:      (path) => this.lassoPath.set(path),
                onLassoSelectionChanged: (ids) => {
                    if      (ids.size === 0) { this.lassoSelection.set(new Set()); }
                    else if (ids.size === 1) { this.selectedInstanceId.set([...ids][0]); this.lassoSelection.set(new Set()); }
                    else                    { this.lassoSelection.set(ids); this.selectedInstanceId.set(null); }
                },
                onSelectedChanged: (id) => {
                    this.selectedInstanceId.set(id);
                    if (id) this.lassoSelection.set(new Set());
                    this.stretchMode.set(false);
                    this.menuVisible.set(false);
                },
                onStickerDraggedOff: (_id, allIds) => {
                    this.dragNearEdge.set(false);
                    const removed = new Set(allIds);
                    this.animateRemoval(allIds, () => {
                        const updated = this.stickers().filter(p => !removed.has(p.instanceId));
                        this.undo.push(updated);
                        this.placementsChanged.emit(updated);
                    });
                },
                onDragNearEdge:    (near) => this.dragNearEdge.set(near),
                onPointerUpCommit: ()     => this.undo.push(this.stickers()),
            },
        );

        this.resizeObserver = new ResizeObserver(([e]) => {
            this.canvasW.set(e.contentRect.width);
            this.canvasH.set(e.contentRect.height);
        });
        this.resizeObserver.observe(this.canvasArea.nativeElement);

        if (this.interactive()) this.installInputListeners();
    }

    ngOnDestroy(): void {
        this.removeTouchListeners?.();
        this.resizeObserver?.disconnect();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    toDataUrl(): Promise<string> {
        return renderCanvasToDataUrl(this.canvasArea.nativeElement, this.stickers(), id => this.getStickerUrl(id));
    }

    generateInstanceId(): string { return ops.generateInstanceId(); }

    // ── Context menu ──────────────────────────────────────────────────────────

    onMenuToggle(): void { this.menuVisible.set(!this.menuVisible()); }

    onContextMenuAction(action: ContextMenuAction): void {
        this.menuVisible.set(false);
        const ids = this.selectionIds();
        switch (action) {
            case 'delete':        this.removeSelected(); break;
            case 'flipH':         this.commitTransform(ids.length === 1 ? ops.mirrorSingle(this.stickers(), ids[0], 'h') : ops.applyGroupTransform(this.stickers(), ids, 0, 1, 'h')); break;
            case 'zForward':      this.commitTransform(ops.swapZ(this.stickers(), ids, +1)); break;
            case 'zBackward':     this.commitTransform(ops.swapZ(this.stickers(), ids, -1)); break;
            case 'zFront':        this.commitTransform(ops.moveToEdge(this.stickers(), ids, 'front')); break;
            case 'zBack':         this.commitTransform(ops.moveToEdge(this.stickers(), ids, 'back')); break;
            case 'group':         this.commitGroup(ops.groupPlacements(this.stickers(), ids), ids); break;
            case 'ungroup':       this.commitGroup(ops.ungroupPlacements(this.stickers(), ids), ids); break;
            case 'toggleStretch': this.stretchMode.set(!this.stretchMode()); break;
            case 'duplicate':     this.doDuplicate(); break;
        }
    }

    // ── Handle drag (selection overlay) ──────────────────────────────────────

    onHandleDrag(ev: HandleDragEvent): void {
        const ids = this.selectionIds();
        if (!ids.length) return;

        if (ev.handle === 'rotate') {
            this.emit(ops.applyRotationDelta(this.stickers(), ids, ev.dx));
            if (ev.done) this.undo.push(this.stickers());
            return;
        }
        if (ev.handle === 'n' || ev.handle === 's' || ev.handle === 'e' || ev.handle === 'w') {
            if (ids.length !== 1) return;
            this.emit(ops.applyStretchHandle(this.stickers(), ids[0], ev.handle, ev.dx, ev.dy, id => this.getRenderedSize(id)));
            if (ev.done) this.undo.push(this.stickers());
            return;
        }
        const bb = this.boundingBox();
        this.emit(ops.applyCornerScale(
            this.stickers(), ids, ev.handle as 'nw' | 'ne' | 'se' | 'sw',
            ev.dx, ev.dy,
            bb ? {w: bb.w, h: bb.h} : null,
            id => this.getRenderedSize(id),
        ));
        if (ev.done) this.undo.push(this.stickers());
    }

    // ── Toolbar / programmatic actions ────────────────────────────────────────


    removeSelected(): void {
        const group = this.lassoSelection();
        const ids   = group.size > 0 ? [...group] : (this.selectedInstanceId() ? [this.selectedInstanceId()!] : []);
        if (!ids.length) return;
        this.selectedInstanceId.set(null);
        this.lassoSelection.set(new Set());
        const removedSet = new Set(ids);
        this.animateRemoval(ids, () => {
            const updated = this.stickers().filter(p => !removedSet.has(p.instanceId));
            this.undo.push(updated);
            if (group.size > 0) this.placementsChanged.emit(updated);
            else                this.stickerRemoved.emit(ids[0]);
        });
    }

    undoAction(): void {
        const prev = this.undo.undo();
        if (prev) { this.clearSelection(); this.emit(prev); }
    }

    redoAction(): void {
        const next = this.undo.redo();
        if (next) { this.clearSelection(); this.emit(next); }
    }

    // ── Template helpers ──────────────────────────────────────────────────────

    getStickerUrl(stickerId: string): string {
        return this.catalogMap.get(stickerId)?.imageUrl ?? '';
    }

    getHitboxSvgPoints(stickerId: string): string {
        const def = this.catalogMap.get(stickerId);
        if (!def?.hitboxPolygon || def.hitboxPolygon.length < 3) return '';
        return def.hitboxPolygon.map(p => `${p.x},${p.y}`).join(' ');
    }

    isSelected(instanceId: string): boolean {
        return this.selectedInstanceId() === instanceId || this.lassoSelection().has(instanceId);
    }

    isLassoSelected(instanceId: string): boolean {
        return this.lassoSelection().has(instanceId);
    }

    getStickerTransform(p: StickerPlacement): string {
        const pp = p as any;
        const sx = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
        const sy = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
        // transform-origin: 0 0 → pivot at (p.x, p.y).
        // translate(-50%,-50%) → center on pivot; then scale; then rotate — all around (p.x, p.y).
        return `rotate(${p.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private emit(updated: StickerPlacement[]): void { this.placementsChanged.emit(updated); }

    private commitTransform(updated: StickerPlacement[]): void {
        this.emit(updated);
        this.undo.push(updated);
    }

    private commitGroup(updated: StickerPlacement[], ids: string[]): void {
        this.emit(updated);
        this.undo.push(updated);
        this.lassoSelection.set(new Set(ids));
        this.selectedInstanceId.set(null);
    }

    private doDuplicate(): void {
        const {updated, newIds} = ops.duplicatePlacements(this.stickers(), this.selectionIds());
        this.emit(updated);
        this.undo.push(updated);
        if (newIds.length === 1) { this.selectedInstanceId.set(newIds[0]); this.lassoSelection.set(new Set()); }
        else                     { this.lassoSelection.set(new Set(newIds)); this.selectedInstanceId.set(null); }
    }

    private clearSelection(): void {
        this.selectedInstanceId.set(null);
        this.lassoSelection.set(new Set());
    }

    private animateRemoval(instanceIds: string[], done: () => void): void {
        const toAnimate = instanceIds.filter(id => !this.removingIds.has(id));
        if (!toAnimate.length) return;
        for (const id of toAnimate) this.removingIds.add(id);

        const wrappers = toAnimate
            .map(id => this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-removal-wrapper-for="${id}"]`))
            .filter((el): el is HTMLElement => !!el);

        if (!wrappers.length) {
            for (const id of toAnimate) this.removingIds.delete(id);
            done();
            return;
        }
        gsap.killTweensOf(wrappers);
        gsap.to(wrappers, {
            scale: 0, opacity: 0, duration: 0.18, ease: 'power2.in',
            overwrite: true, transformOrigin: '50% 50%', force3D: true,
            onComplete: () => {
                for (const id of toAnimate) this.removingIds.delete(id);
                gsap.set(wrappers, {clearProps: 'transform,opacity,willChange,transformOrigin'});
                done();
            },
        });
    }

    private getRenderedSize(instanceId: string): {w: number; h: number} {
        const wrapper = this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
        if (!wrapper) return {w: 64, h: 64};
        const img = wrapper.querySelector('img') as HTMLImageElement | null;
        return {w: img?.offsetWidth || wrapper.offsetWidth || 64, h: img?.offsetHeight || wrapper.offsetHeight || 64};
    }

    private hitTestSticker(clientX: number, clientY: number): string | null {
        const rect   = this.canvasArea.nativeElement.getBoundingClientRect();
        const sorted = [...this.stickers()].sort((a, b) => b.zIndex - a.zIndex);
        for (const p of sorted) {
            const {w, h} = this.getRenderedSize(p.instanceId);
            const ox     = clientX - (rect.left + p.x);
            const oy     = clientY - (rect.top  + p.y);
            const negRad = -p.rotation * Math.PI / 180;
            const ux     = ox * Math.cos(negRad) - oy * Math.sin(negRad);
            const uy     = ox * Math.sin(negRad) + oy * Math.cos(negRad);
            const pp     = p as any;
            const scaleX = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
            const scaleY = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
            if (scaleX === 0 || scaleY === 0) continue;
            const lx = ux / (w * scaleX) + 0.5;
            const ly = uy / (h * scaleY) + 0.5;
            if (lx < 0 || lx > 1 || ly < 0 || ly > 1) continue;
            const def = this.catalogMap.get(p.stickerId);
            if (def?.hitboxPolygon && def.hitboxPolygon.length >= 3) {
                if (pointInPolygon(lx, ly, def.hitboxPolygon)) return p.instanceId;
                continue;
            }
            return p.instanceId;
        }
        return null;
    }

    // ── Input event wiring ────────────────────────────────────────────────────

    private installInputListeners(): void {
        const el = this.canvasArea.nativeElement;
        el.style.touchAction = 'none';
        (el.style as any).webkitTouchCallout = 'none';
        (el.style as any).webkitUserSelect   = 'none';

        const isOverlay = (ev: Event) => !!(ev.target as HTMLElement).closest('[data-canvas-overlay]');

        const onTouchStart = (ev: TouchEvent) => {
            if (isOverlay(ev)) return;
            ev.preventDefault();
            this.menuVisible.set(false);
            this.syncGesture();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerDown(t.identifier, t.clientX, t.clientY);
        };
        const onTouchMove = (ev: TouchEvent) => {
            if (isOverlay(ev)) return;
            ev.preventDefault();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerMove(t.identifier, t.clientX, t.clientY);
        };
        const onTouchEnd = (ev: TouchEvent) => {
            if (isOverlay(ev)) return;
            ev.preventDefault();
            for (const t of Array.from(ev.changedTouches))
                this.gesture.onPointerUp(t.identifier, t.clientX, t.clientY);
        };

        let cleanupMouse: (() => void) | null = null;
        const onMouseDown = (ev: MouseEvent) => {
            if (ev.button !== 0 || isOverlay(ev)) return;
            ev.preventDefault();
            this.menuVisible.set(false);
            this.syncGesture();
            this.gesture.onPointerDown(-1, ev.clientX, ev.clientY);
            const onMove = (e: MouseEvent) => { e.preventDefault(); this.gesture.onPointerMove(-1, e.clientX, e.clientY); };
            const onUp   = (e: MouseEvent) => {
                this.gesture.onPointerUp(-1, e.clientX, e.clientY);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp);
                cleanupMouse = null;
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
            cleanupMouse = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        };

        el.addEventListener('touchstart',  onTouchStart, {passive: false});
        el.addEventListener('touchmove',   onTouchMove,  {passive: false});
        el.addEventListener('touchend',    onTouchEnd,   {passive: false});
        el.addEventListener('touchcancel', onTouchEnd,   {passive: false});
        el.addEventListener('mousedown',   onMouseDown);

        this.removeTouchListeners = () => {
            el.removeEventListener('touchstart',  onTouchStart as EventListener);
            el.removeEventListener('touchmove',   onTouchMove  as EventListener);
            el.removeEventListener('touchend',    onTouchEnd   as EventListener);
            el.removeEventListener('touchcancel', onTouchEnd   as EventListener);
            el.removeEventListener('mousedown',   onMouseDown);
            cleanupMouse?.();
        };
    }

    private syncGesture(): void {
        this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
    }
}
