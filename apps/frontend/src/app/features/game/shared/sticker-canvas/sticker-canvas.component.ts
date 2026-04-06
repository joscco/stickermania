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
import gsap from "gsap";
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
  readonly stickers = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(20);
  readonly interactive = input<boolean>(false);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly stickerRemoved = output<string>();

  @ViewChild("canvasArea") private canvasArea!: ElementRef<HTMLDivElement>;
  @ViewChild("deleteZone") private deleteZone!: ElementRef<HTMLDivElement>;

  public get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── View state ────────────────────────────────────────────────
  public readonly selectedInstanceId = signal<string | null>(null);
  public readonly lassoSelection = signal<Set<string>>(new Set());
  public readonly lassoPath = signal<{ x: number; y: number }[] | null>(null);
  public readonly dragNearEdge = signal<boolean>(false);

  // ── Internals ─────────────────────────────────────────────────
  private catalogMap = new Map<string, StickerDefinition>();
  private gesture!: StickerGestureHandler;
  private removeTouchListeners: (() => void) | null = null;

  constructor() {
    effect(() => {
      const catalog = this.stickerCatalog();
      this.catalogMap.clear();
      for (const s of catalog) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      const stickers = this.stickers();
      this.gesture?.syncState(stickers, this.selectedInstanceId(), this.lassoSelection());
    });
    // Animate the delete-zone overlay
    effect(() => {
      const near = this.dragNearEdge();
      const el = this.deleteZone?.nativeElement;
      if (!el) return;
      gsap.to(el, {
        opacity: near ? 1 : 0,
        duration: near ? 0.18 : 0.12,
        ease: near ? "power2.out" : "power2.in",
        overwrite: true,
      });
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
        onLassoPathChanged: (p) => this.lassoPath.set(p),
        onLassoSelectionChanged: (ids) => this.lassoSelection.set(ids),
        onSelectedChanged: (id) => this.selectedInstanceId.set(id),
        onStickerDraggedOff: (_id, allIds) => {
          this.dragNearEdge.set(false);
          const removedSet = new Set(allIds);
          this.animateRemoval(allIds, () => {
            this.placementsChanged.emit(
              this.stickers().filter(p => !removedSet.has(p.instanceId)),
            );
          });
        },
        onDragNearEdge: (near) => this.dragNearEdge.set(near),
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

  /** Builds the CSS transform string including rotation, scale, and flip.
   *  Uses transform-origin: top left in the template, so we translate to center,
   *  apply rotate+scale, then translate back. This avoids squishing at canvas edges. */
  public getStickerTransform(p: StickerPlacement): string {
    const sx = (p.flipX ? -1 : 1) * p.scale;
    const sy = (p.flipY ? -1 : 1) * p.scale;
    // The img is h-16 w-auto; we read the real size from the DOM for accurate centering
    // but we can't call getRenderedSize here (template helper, called per frame).
    // Instead, use CSS: translate(50%, 50%) → rotate+scale → translate(-50%, -50%)
    // This effectively scales around the center while keeping top-left as (x, y).
    return `translate(50%, 50%) rotate(${p.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
  }

  // ── Toolbar actions ───────────────────────────────────────────

  public rotateSelected(degrees: number): void {
    const ids = this.selectionIds();
    if (!ids.length) return;

    if (ids.length === 1) {
      this.emit(this.stickers().map(p =>
        p.instanceId === ids[0] ? {...p, rotation: p.rotation + degrees} : p,
      ));
      return;
    }

    // Group rotation around centroid
    this.applyGroupTransform(ids, degrees, 1, null);
  }

  public scaleSelected(factor: number): void {
    const ids = this.selectionIds();
    if (!ids.length) return;

    if (ids.length === 1) {
      this.emit(this.stickers().map(p =>
        p.instanceId === ids[0]
          ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))}
          : p,
      ));
      return;
    }

    // Group scale around centroid
    this.applyGroupTransform(ids, 0, factor, null);
  }

  public mirrorSelected(axis: 'h' | 'v'): void {
    const ids = this.selectionIds();
    if (!ids.length) return;

    if (ids.length === 1) {
      this.emit(this.stickers().map(p => {
        if (p.instanceId !== ids[0]) return p;
        return axis === 'h' ? {...p, flipX: !p.flipX} : {...p, flipY: !p.flipY};
      }));
      return;
    }

    // Group mirror around centroid
    this.applyGroupTransform(ids, 0, 1, axis);
  }

  public removeSelected(): void {
    const group = this.lassoSelection();
    if (group.size > 0) {
      this.lassoSelection.set(new Set());
      this.animateRemoval([...group], () =>
        this.emit(this.stickers().filter(p => !group.has(p.instanceId))),
      );
      return;
    }
    const id = this.selectedInstanceId();
    if (!id) return;
    this.selectedInstanceId.set(null);
    this.animateRemoval([id], () => this.stickerRemoved.emit(id));
  }

  public bringForward(): void {
    this.swapZ(+1);
  }

  public sendBackward(): void {
    this.swapZ(-1);
  }

  /**
   * Applies a group transform (rotate, scale, mirror) around the group centroid.
   * Same math as pinch gesture but triggered by toolbar buttons.
   */
  private applyGroupTransform(
    ids: string[],
    rotateDeg: number,
    scaleFactor: number,
    mirrorAxis: 'h' | 'v' | null,
  ): void {
    const all = this.stickers();
    const selected = all.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return;

    // Compute group centroid
    let cx = 0, cy = 0;
    for (const p of selected) {
      const {w, h} = this.getRenderedSize(p.instanceId);
      cx += p.x + (w * p.scale) / 2;
      cy += p.y + (h * p.scale) / 2;
    }
    cx /= selected.length;
    cy /= selected.length;

    const rotRad = (rotateDeg * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    this.emit(all.map(p => {
      if (!ids.includes(p.instanceId)) return p;
      const {w, h} = this.getRenderedSize(p.instanceId);
      const scaledW = w * p.scale;
      const scaledH = h * p.scale;

      // Vector from centroid to sticker center
      let relX = (p.x + scaledW / 2) - cx;
      let relY = (p.y + scaledH / 2) - cy;

      // Mirror
      if (mirrorAxis === 'h') relX = -relX;
      if (mirrorAxis === 'v') relY = -relY;

      // Rotate the relative vector
      const newRelX = relX * cos - relY * sin;
      const newRelY = relX * sin + relY * cos;

      // Scale
      const newScale = Math.max(0.2, Math.min(4, p.scale * scaleFactor));
      const newScaledW = w * newScale;
      const newScaledH = h * newScale;

      // New position: centroid + rotated/scaled offset − half new size
      const newX = cx + newRelX * scaleFactor - newScaledW / 2;
      const newY = cy + newRelY * scaleFactor - newScaledH / 2;

      return {
        ...p,
        x: newX,
        y: newY,
        scale: newScale,
        rotation: p.rotation + rotateDeg,
        ...(mirrorAxis === 'h' ? {flipX: !p.flipX} : {}),
        ...(mirrorAxis === 'v' ? {flipY: !p.flipY} : {}),
      };
    }));
  }

  // ── Private ───────────────────────────────────────────────────

  /** Tween sticker DOM elements to scale 0 + fade, then call `done`.
   *  Uses a manual tween on the CSS `scale` property so it composites
   *  with the existing `transform` (which contains translate + rotate + scale). */
  private animateRemoval(instanceIds: string[], done: () => void): void {
    const els = instanceIds
      .map(id => this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-instance-id="${id}"]`))
      .filter((el): el is HTMLElement => !!el);

    if (!els.length) {
      done();
      return;
    }

    // Animate using a proxy object so we control the CSS `scale` property directly.
    // The CSS `scale` property composes on top of the existing `transform` and
    // scales around the element's own center — no anchor-point shift.
    const proxy = {t: 1};
    gsap.to(proxy, {
      t: 0, duration: 0.18, ease: "power2.in",
      // Set transform-origin to center for proper scaling, then animate the `scale` property.
      onStart: () => {
        for (const el of els) {
          el.style.transformOrigin = 'center';
        }
      },
      onUpdate: () => {
        for (const el of els) {
          el.style.scale = `${proxy.t}`;
          el.style.opacity = `${proxy.t}`;
        }
      },
      onComplete: () => done(),
    });
  }


  private selectionIds(): string[] {
    const grp = this.lassoSelection();
    if (grp.size > 0) {
      return [...grp];
    }
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
      if (p.instanceId === id) return {...p, zIndex: neighbor.zIndex};
      if (p.instanceId === neighbor.instanceId) return {...p, zIndex: current.zIndex};
      return p;
    }));
  }

  /** Returns the un-scaled rendered image dimensions for a placed sticker. */
  private getRenderedSize(instanceId: string): { w: number; h: number } {
    const img = this.canvasArea?.nativeElement.querySelector(
      `[data-instance-id="${instanceId}"] img`,
    ) as HTMLImageElement | null;
    return {w: img?.offsetWidth ?? 64, h: img?.offsetHeight ?? 64};
  }

  private hitTestSticker(clientX: number, clientY: number): string | null {
    const rect = this.canvasArea.nativeElement.getBoundingClientRect();
    const sorted = [...this.stickers()].sort((a, b) => b.zIndex - a.zIndex);

    for (const p of sorted) {
      const {w: imgW, h: imgH} = this.getRenderedSize(p.instanceId);
      if (imgW === 0 || imgH === 0) continue;

      const scaledW = imgW * p.scale;
      const scaledH = imgH * p.scale;
      const cx = p.x + scaledW / 2 + rect.left;
      const cy = p.y + scaledH / 2 + rect.top;

      // Rotate click point into sticker's local space
      const dx = clientX - cx;
      const dy = clientY - cy;
      const rad = (-p.rotation * Math.PI) / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

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
    (el.style as any).webkitUserSelect = "none";

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
      const onMove = (e: MouseEvent) => {
        e.preventDefault();
        this.gesture.onPointerMove(-1, e.clientX, e.clientY);
      };
      const onUp = (e: MouseEvent) => {
        this.gesture.onPointerUp(-1, e.clientX, e.clientY);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        cleanupMouse = null;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      cleanupMouse = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
    };

    el.addEventListener("touchstart", onTouchStart, {passive: false});
    el.addEventListener("touchmove", onTouchMove, {passive: false});
    el.addEventListener("touchend", onTouchEnd, {passive: false});
    el.addEventListener("touchcancel", onTouchEnd, {passive: false});
    el.addEventListener("mousedown", onMouseDown);

    this.removeTouchListeners = () => {
      el.removeEventListener("touchstart", onTouchStart as EventListener);
      el.removeEventListener("touchmove", onTouchMove as EventListener);
      el.removeEventListener("touchend", onTouchEnd as EventListener);
      el.removeEventListener("touchcancel", onTouchEnd as EventListener);
      el.removeEventListener("mousedown", onMouseDown);
      cleanupMouse?.();
    };
  }

  /** Keeps the gesture handler's snapshot in sync before each gesture starts. */
  private syncGesture(): void {
    this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
  }
}
