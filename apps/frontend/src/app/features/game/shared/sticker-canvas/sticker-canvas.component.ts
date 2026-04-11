import {
  Component,
  input,
  output,
  signal,
  computed,
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
import {StickerSelectionOverlayComponent, type HandleDragEvent} from "./sticker-selection-overlay.component";
import {StickerContextMenuComponent, type ContextMenuAction} from "../sticker-editor/sticker-context-menu.component";
import {EditorUndoStack} from "../sticker-editor/sticker-undo-stack";
import type {BoundingBox} from "../sticker-editor/sticker-editor-state";

@Component({
  selector: "app-sticker-canvas",
  standalone: true,
  imports: [CommonModule, StickerSelectionOverlayComponent, StickerContextMenuComponent],
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

  private readonly removingInstanceIds = new Set<string>();

  @ViewChild("canvasArea") private canvasArea!: ElementRef<HTMLDivElement>;
  @ViewChild("deleteZone") private deleteZone!: ElementRef<HTMLDivElement>;

  public get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── Selection state (flat signals — triggers Angular re-render reliably) ──
  public readonly selectedInstanceId = signal<string | null>(null);
  public readonly lassoSelection     = signal<Set<string>>(new Set());
  public readonly stretchMode        = signal<boolean>(false);
  public readonly menuVisible        = signal<boolean>(false);

  // Derived
  public readonly hasSelection = computed(() =>
    !!this.selectedInstanceId() || this.lassoSelection().size > 0,
  );
  public readonly isMultiSelection = computed(() => this.lassoSelection().size > 1);
  public readonly selectionIds = computed<string[]>(() => {
    const s = this.lassoSelection();
    if (s.size > 0) return [...s];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  // ── Undo ──────────────────────────────────────────────────────
  public readonly undo = new EditorUndoStack();

  // ── Lasso / drag state ────────────────────────────────────────
  public readonly lassoPath    = signal<{x: number; y: number}[] | null>(null);
  public readonly dragNearEdge = signal<boolean>(false);

  // ── Selection geometry → drives overlay + context menu ───────
  /**
   * For single selection: axis of the overlay matches the sticker's rotation.
   * For multi selection: axis-aligned bounding box (no rotation).
   *
   * `box`      – the unrotated local rect (x/y = top-left of sticker in canvas coords)
   * `rotation` – degrees to rotate the overlay wrapper around box center
   */
  public readonly selectionInfo = computed<{
    box: BoundingBox;
    rotation: number;
  } | null>(() => {
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
      // p.x/p.y = center → box is trivially centered there
      return { box: {x: p.x - hw, y: p.y - hh, w: hw * 2, h: hh * 2}, rotation: p.rotation };
    }

    // Multi: axis-aligned envelope of all rotated corners (works for both real groups
    // and temporary lasso selections). Rotation handle still works via applyGroupTransform.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of placements) {
      const pp = p as any;
      const {w, h} = this.getRenderedSize(p.instanceId);
      const hw  = w * p.scale * (pp.scaleX ?? 1) / 2;
      const hh  = h * p.scale * (pp.scaleY ?? 1) / 2;
      const rad = p.rotation * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      for (const [ex, ey] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]] as [number,number][]) {
        const rx = p.x + ex*cos - ey*sin;
        const ry = p.y + ex*sin + ey*cos;
        if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
      }
    }
    return { box: {x: minX, y: minY, w: Math.max(1, maxX-minX), h: Math.max(1, maxY-minY)}, rotation: 0 };
  });

  // Keep boundingBox alias for context-menu anchor
  public readonly boundingBox = computed<BoundingBox | null>(() => this.selectionInfo()?.box ?? null);

  public readonly menuAnchorX = computed(() => {
    const si = this.selectionInfo();
    if (!si) return 0;
    // Place menu to the right of the axis-aligned envelope of the (possibly rotated) box
    if (si.rotation === 0) return si.box.x + si.box.w + 14;
    // For rotated single: just use x + w + margin (good enough)
    return si.box.x + si.box.w + 14;
  });
  public readonly menuAnchorY = computed(() => (this.boundingBox()?.y ?? 0) + (this.boundingBox()?.h ?? 0) + 6);
  public readonly canvasW = signal(400);
  public readonly canvasH = signal(400);

  // ── Group helpers ─────────────────────────────────────────────
  public readonly canGroup = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) return false;
    const placements = this.stickers();
    const first = placements.find(p => p.instanceId === ids[0]);
    return !first?.groupId || ids.some(id => {
      const p = placements.find(pp => pp.instanceId === id);
      return p?.groupId !== first.groupId;
    });
  });
  public readonly canUngroup = computed(() => {
    const ids = this.selectionIds();
    return this.stickers().some(p => ids.includes(p.instanceId) && !!p.groupId);
  });

  // ── Internals ─────────────────────────────────────────────────
  private catalogMap = new Map<string, StickerDefinition>();
  private gesture!: StickerGestureHandler;
  private removeTouchListeners: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const catalog = this.stickerCatalog();
      this.catalogMap.clear();
      for (const s of catalog) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      this.gesture?.syncState(
        this.stickers(),
        this.selectedInstanceId(),
        this.lassoSelection(),
      );
    });
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
        onLassoPathChanged:  (path) => this.lassoPath.set(path),
        onLassoSelectionChanged: (ids) => {
          if (ids.size === 0) {
            this.lassoSelection.set(new Set());
          } else if (ids.size === 1) {
            this.selectedInstanceId.set([...ids][0]);
            this.lassoSelection.set(new Set());
          } else {
            this.lassoSelection.set(ids);
            this.selectedInstanceId.set(null);
          }
        },
        onSelectedChanged: (id) => {
          if (id) {
            this.selectedInstanceId.set(id);
            this.lassoSelection.set(new Set());
          } else {
            // Only clear selectedInstanceId — lassoSelection is managed by onLassoSelectionChanged
            this.selectedInstanceId.set(null);
          }
          this.stretchMode.set(false);
          this.menuVisible.set(false);
        },
        onStickerDraggedOff: (_id, allIds) => {
          this.dragNearEdge.set(false);
          const removedSet = new Set(allIds);
          this.animateRemoval(allIds, () => {
            const updated = this.stickers().filter(p => !removedSet.has(p.instanceId));
            this.undo.push(updated);
            this.placementsChanged.emit(updated);
          });
        },
        onDragNearEdge: (near) => this.dragNearEdge.set(near),
        onPointerUpCommit: () => this.undo.push(this.stickers()),
      },
    );

    this.resizeObserver = new ResizeObserver(entries => {
      const e = entries[0];
      this.canvasW.set(e.contentRect.width);
      this.canvasH.set(e.contentRect.height);
    });
    this.resizeObserver.observe(this.canvasArea.nativeElement);

    if (this.interactive()) this.installTouchListeners();
  }

  ngOnDestroy(): void {
    this.removeTouchListeners?.();
    this.resizeObserver?.disconnect();
  }

  // ── Public API ────────────────────────────────────────────────

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

  public getStickerTransform(p: StickerPlacement): string {
    const pp = p as any;
    const sx = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
    const sy = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
    // transform-origin: 0 0 → all transforms happen around (p.x, p.y) in canvas space.
    // CSS matrix = M_rotate × M_scale × M_translate, applied to point P as M×P, so
    // visually: translate first, then scale, then rotate — all pinned to (p.x, p.y).
    //   translate(-50%,-50%): moves element so its center lands on (p.x,p.y)
    //   scale(sx,sy):         scales around (p.x,p.y)  ✓
    //   rotate(r):            rotates around (p.x,p.y) ✓
    return `rotate(${p.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
  }

  // ── Context menu ──────────────────────────────────────────────

  public onMenuToggle(): void {
    this.menuVisible.set(!this.menuVisible());
  }

  public onContextMenuAction(action: ContextMenuAction): void {
    this.menuVisible.set(false);
    switch (action) {
      case 'delete':        this.removeSelected();    break;
      case 'flipH':         this.mirrorSelected('h'); break;
      case 'zForward':      this.swapZ(+1);           break;
      case 'zBackward':     this.swapZ(-1);           break;
      case 'zFront':        this.bringToFront();      break;
      case 'zBack':         this.sendToBack();        break;
      case 'group':         this.groupSelected();     break;
      case 'ungroup':       this.ungroupSelected();   break;
      case 'toggleStretch': this.stretchMode.set(!this.stretchMode()); break;
      case 'duplicate':     this.duplicateSelected(); break;
    }
  }

  // ── Handle drag ───────────────────────────────────────────────

  public onHandleDrag(ev: HandleDragEvent): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    if (ev.handle === 'rotate')
      { this.applyRotationHandle(ids, ev.dx, ev.done); return; }
    if (ev.handle === 'n' || ev.handle === 's' || ev.handle === 'e' || ev.handle === 'w')
      { this.applyStretchHandle(ids, ev.handle, ev.dx, ev.dy, ev.done); return; }
    this.applyCornerScale(ids, ev.handle as 'nw'|'ne'|'se'|'sw', ev.dx, ev.dy, ev.done);
  }

  // ── Toolbar / public actions ──────────────────────────────────

  public rotateSelected(degrees: number): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    ids.length === 1
      ? this.emit(this.stickers().map(p => p.instanceId === ids[0] ? {...p, rotation: p.rotation + degrees} : p))
      : this.applyGroupTransform(ids, degrees, 1, null);
    this.undo.push(this.stickers());
  }

  public scaleSelected(factor: number): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    ids.length === 1
      ? this.emit(this.stickers().map(p => p.instanceId === ids[0] ? {...p, scale: Math.max(0.2, Math.min(4, p.scale * factor))} : p))
      : this.applyGroupTransform(ids, 0, factor, null);
    this.undo.push(this.stickers());
  }

  public mirrorSelected(axis: 'h' | 'v'): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    ids.length === 1
      ? this.emit(this.stickers().map(p => p.instanceId !== ids[0] ? p : axis === 'h' ? {...p, flipX: !p.flipX} : {...p, flipY: !p.flipY}))
      : this.applyGroupTransform(ids, 0, 1, axis);
    this.undo.push(this.stickers());
  }

  public removeSelected(): void {
    const group = this.lassoSelection();
    if (group.size > 0) {
      const ids = [...group];
      this.selectedInstanceId.set(null); this.lassoSelection.set(new Set());
      this.animateRemoval(ids, () => {
        const updated = this.stickers().filter(p => !group.has(p.instanceId));
        this.undo.push(updated); this.emit(updated);
      });
      return;
    }
    const id = this.selectedInstanceId();
    if (!id) return;
    this.selectedInstanceId.set(null);
    this.animateRemoval([id], () => {
      const updated = this.stickers().filter(p => p.instanceId !== id);
      this.undo.push(updated); this.stickerRemoved.emit(id);
    });
  }

  public duplicateSelected(): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    const all = this.stickers();
    const maxZ = all.length > 0 ? Math.max(...all.map(p => p.zIndex)) : 0;
    const copies: StickerPlacement[] = ids.flatMap((id, i) => {
      const orig = all.find(p => p.instanceId === id);
      return orig ? [{...orig, instanceId: this.generateInstanceId(), x: orig.x + 16, y: orig.y + 16, zIndex: maxZ + i + 1, groupId: undefined}] : [];
    });
    const updated = [...all, ...copies];
    this.emit(updated); this.undo.push(updated);
    if (copies.length === 1) { this.selectedInstanceId.set(copies[0].instanceId); this.lassoSelection.set(new Set()); }
    else { this.lassoSelection.set(new Set(copies.map(c => c.instanceId))); this.selectedInstanceId.set(null); }
  }

  public groupSelected(): void {
    const ids = this.selectionIds();
    if (ids.length < 2) return;
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const updated = this.stickers().map(p => ids.includes(p.instanceId) ? {...p, groupId} : p);
    this.emit(updated); this.undo.push(updated);
    this.lassoSelection.set(new Set(ids)); this.selectedInstanceId.set(null);
  }

  public ungroupSelected(): void {
    const ids = this.selectionIds();
    const updated = this.stickers().map(p => ids.includes(p.instanceId) ? {...p, groupId: undefined} : p);
    this.emit(updated); this.undo.push(updated);
    this.lassoSelection.set(new Set(ids)); this.selectedInstanceId.set(null);
  }

  public bringForward():  void { this.swapZ(+1); }
  public sendBackward():  void { this.swapZ(-1); }
  public bringToFront():  void { this.moveToEdge('front'); }
  public sendToBack():    void { this.moveToEdge('back'); }

  public undoAction(): void {
    const prev = this.undo.undo();
    if (prev) { this.selectedInstanceId.set(null); this.lassoSelection.set(new Set()); this.emit(prev); }
  }

  public redoAction(): void {
    const next = this.undo.redo();
    if (next) { this.selectedInstanceId.set(null); this.lassoSelection.set(new Set()); this.emit(next); }
  }

  // ── Handle math ───────────────────────────────────────────────

  private applyCornerScale(ids: string[], corner: 'nw'|'ne'|'se'|'sw', dx: number, dy: number, done: boolean): void {
    // Signs: SE = (+,+), NE = (+,-), SW = (-,+), NW = (-,-)
    const signX = (corner === 'ne' || corner === 'se') ? 1 : -1;
    const signY = (corner === 'se' || corner === 'sw') ? 1 : -1;
    const delta = (dx * signX + dy * signY) / 2;

    if (ids.length !== 1) {
      const bb = this.boundingBox();
      if (!bb || bb.w < 1 || bb.h < 1) return;
      const factor = 1 + delta / Math.max(bb.w / 2, bb.h / 2);
      this.applyGroupTransform(ids, 0, Math.max(0.05, factor), null);
      if (done) this.undo.push(this.stickers());
      return;
    }
    const id = ids[0];
    const p  = this.stickers().find(s => s.instanceId === id);
    if (!p) return;
    const {w, h} = this.getRenderedSize(id);
    const refSize  = Math.max(w, h) * p.scale;
    const newScale = Math.max(0.1, Math.min(6, p.scale + (delta / refSize) * p.scale));
    this.emit(this.stickers().map(pl =>
      pl.instanceId === id ? {...pl, scale: newScale} : pl,
    ));
    if (done) this.undo.push(this.stickers());
  }

  private applyRotationHandle(ids: string[], dx: number, done: boolean): void {
    // dx is angle-delta in degrees (from overlay's angle tracking around sticker center)
    ids.length === 1
      ? this.emit(this.stickers().map(p => p.instanceId === ids[0] ? {...p, rotation: p.rotation + dx} : p))
      : this.applyGroupTransform(ids, dx, 1, null);
    if (done) this.undo.push(this.stickers());
  }

  private applyStretchHandle(ids: string[], handle: 'n'|'s'|'e'|'w', dx: number, dy: number, done: boolean): void {
    if (ids.length !== 1) return;
    const id = ids[0];
    const p  = this.stickers().find(s => s.instanceId === id);
    if (!p) return;
    const pp = p as any;
    const {w, h} = this.getRenderedSize(id);
    // CSS transform scales around element center — scaleX/scaleY only, p.x/p.y unchanged.
    let newScaleX = pp.scaleX ?? 1;
    let newScaleY = pp.scaleY ?? 1;
    if (handle === 'e') newScaleX = Math.max(0.1, newScaleX + dx / (w * p.scale));
    if (handle === 'w') newScaleX = Math.max(0.1, newScaleX - dx / (w * p.scale));
    if (handle === 's') newScaleY = Math.max(0.1, newScaleY + dy / (h * p.scale));
    if (handle === 'n') newScaleY = Math.max(0.1, newScaleY - dy / (h * p.scale));
    this.emit(this.stickers().map(pl =>
      pl.instanceId === id ? {...pl, scaleX: newScaleX, scaleY: newScaleY} : pl,
    ));
    if (done) this.undo.push(this.stickers());
  }

  private applyGroupTransform(ids: string[], rotateDeg: number, scaleFactor: number, mirrorAxis: 'h'|'v'|null): void {
    const all = this.stickers();
    const selected = all.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return;
    // Group centroid = mean of centers (p.x/p.y are centers)
    const cx = selected.reduce((s, p) => s + p.x, 0) / selected.length;
    const cy = selected.reduce((s, p) => s + p.y, 0) / selected.length;
    const rad = rotateDeg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    this.emit(all.map(p => {
      if (!ids.includes(p.instanceId)) return p;
      let rx = p.x - cx, ry = p.y - cy;
      if (mirrorAxis === 'h') rx = -rx;
      if (mirrorAxis === 'v') ry = -ry;
      const nx = rx*cos - ry*sin, ny = rx*sin + ry*cos;
      return {
        ...p,
        x: cx + nx*scaleFactor,
        y: cy + ny*scaleFactor,
        scale: Math.max(0.2, Math.min(4, p.scale * scaleFactor)),
        rotation: p.rotation + rotateDeg,
        ...(mirrorAxis === 'h' ? {flipX: !p.flipX} : {}),
        ...(mirrorAxis === 'v' ? {flipY: !p.flipY} : {}),
      };
    }));
  }

  // ── Private helpers ───────────────────────────────────────────

  private emit(updated: StickerPlacement[]): void {
    this.placementsChanged.emit(updated);
  }

  private swapZ(direction: 1 | -1): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    const sorted = [...this.stickers()].sort((a, b) => a.zIndex - b.zIndex);
    const groupSet = new Set(ids);
    const outside = sorted.filter(p => !groupSet.has(p.instanceId));
    const inside  = sorted.filter(p =>  groupSet.has(p.instanceId));
    if (!inside.length || !outside.length) return;
    if (direction > 0) {
      const maxGroupZ = Math.max(...inside.map(p => p.zIndex));
      const neighbor  = outside.find(p => p.zIndex > maxGroupZ);
      if (!neighbor) return;
      this.emit(this.stickers().map(p => {
        if (groupSet.has(p.instanceId)) return {...p, zIndex: p.zIndex + (neighbor.zIndex - maxGroupZ) + inside.length};
        if (p.instanceId === neighbor.instanceId) return {...p, zIndex: p.zIndex - inside.length};
        return p;
      }));
    } else {
      const minGroupZ = Math.min(...inside.map(p => p.zIndex));
      const neighbor  = [...outside].reverse().find(p => p.zIndex < minGroupZ);
      if (!neighbor) return;
      this.emit(this.stickers().map(p => {
        if (groupSet.has(p.instanceId)) return {...p, zIndex: p.zIndex - (minGroupZ - neighbor.zIndex) - inside.length};
        if (p.instanceId === neighbor.instanceId) return {...p, zIndex: p.zIndex + inside.length};
        return p;
      }));
    }
    this.undo.push(this.stickers());
  }

  private moveToEdge(edge: 'front' | 'back'): void {
    const ids = this.selectionIds();
    if (!ids.length) return;
    const all = this.stickers();
    const groupSet = new Set(ids);
    const outside = all.filter(p => !groupSet.has(p.instanceId)).sort((a,b) => a.zIndex - b.zIndex);
    const inside  = all.filter(p =>  groupSet.has(p.instanceId)).sort((a,b) => a.zIndex - b.zIndex);
    const refZ = edge === 'front'
      ? (outside.length ? Math.max(...outside.map(p => p.zIndex)) : 0)
      : (outside.length ? Math.min(...outside.map(p => p.zIndex)) : 1);
    this.emit(all.map(p => {
      const i = inside.findIndex(q => q.instanceId === p.instanceId);
      if (i < 0) return p;
      return {...p, zIndex: edge === 'front' ? refZ + i + 1 : refZ - inside.length + i};
    }));
    this.undo.push(this.stickers());
  }

  private animateRemoval(instanceIds: string[], done: () => void): void {
    const idsToAnimate = instanceIds.filter(id => !this.removingInstanceIds.has(id));
    if (!idsToAnimate.length) return;
    for (const id of idsToAnimate) this.removingInstanceIds.add(id);
    const wrappers = idsToAnimate
      .map(id => this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-removal-wrapper-for="${id}"]`))
      .filter((el): el is HTMLElement => !!el);
    if (!wrappers.length) { for (const id of idsToAnimate) this.removingInstanceIds.delete(id); done(); return; }
    gsap.killTweensOf(wrappers);
    gsap.to(wrappers, {
      scale: 0, opacity: 0, duration: 0.18, ease: "power2.in",
      overwrite: true, transformOrigin: "50% 50%", force3D: true,
      onComplete: () => {
        for (const id of idsToAnimate) this.removingInstanceIds.delete(id);
        gsap.set(wrappers, {clearProps: "transform,opacity,willChange,transformOrigin"});
        done();
      },
    });
  }

  private getRenderedSize(instanceId: string): { w: number; h: number } {
    const wrapper = this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    if (!wrapper) return {w: 64, h: 64};
    const img = wrapper.querySelector('img') as HTMLImageElement | null;
    return {w: img?.offsetWidth || wrapper.offsetWidth || 64, h: img?.offsetHeight || wrapper.offsetHeight || 64};
  }

  private hitTestSticker(clientX: number, clientY: number): string | null {
    const canvasRect = this.canvasArea.nativeElement.getBoundingClientRect();
    const sorted = [...this.stickers()].sort((a, b) => b.zIndex - a.zIndex);
    for (const p of sorted) {
      const {w, h} = this.getRenderedSize(p.instanceId);
      // p.x/p.y = visual center
      const ox = clientX - (canvasRect.left + p.x);
      const oy = clientY - (canvasRect.top  + p.y);
      const negRad = -p.rotation * Math.PI / 180;
      const ux = ox*Math.cos(negRad) - oy*Math.sin(negRad);
      const uy = ox*Math.sin(negRad) + oy*Math.cos(negRad);
      const pp = p as any;
      const scaleX = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
      const scaleY = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
      if (scaleX === 0 || scaleY === 0) continue;
      // lx/ly in [0,1] where 0.5,0.5 = center
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

  // ── Pointer event wiring ──────────────────────────────────────

  private installTouchListeners(): void {
    const el = this.canvasArea.nativeElement;
    el.style.touchAction = "none";
    (el.style as any).webkitTouchCallout = "none";
    (el.style as any).webkitUserSelect = "none";

    const isOverlay = (ev: Event) =>
      !!(ev.target as HTMLElement).closest("[data-canvas-overlay]");

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
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        cleanupMouse = null;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      cleanupMouse = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    };

    el.addEventListener("touchstart",  onTouchStart,  {passive: false});
    el.addEventListener("touchmove",   onTouchMove,   {passive: false});
    el.addEventListener("touchend",    onTouchEnd,    {passive: false});
    el.addEventListener("touchcancel", onTouchEnd,    {passive: false});
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

  private syncGesture(): void {
    this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
  }
}
