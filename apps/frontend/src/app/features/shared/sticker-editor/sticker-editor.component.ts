import {
  Component,
  computed,
  input,
  output,
  signal,
  ViewChild,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement} from "@birthday/shared";

/**
 * Shared Sticker-Editor.
 *
 * Combines canvas + palette into one self-contained editor.
 * Used by:
 *  - PlayerBuildingComponent  (receives only the player's hand stickers)
 *  - StickerEditorTestComponent  (receives the full catalog)
 *
 * Dragging from the palette immediately creates a real StickerPlacement
 * on the canvas. If the pointer is released outside the canvas area,
 * the sticker is removed with a disappear animation.
 */

import gsap from 'gsap';
import {StickerCanvasComponent} from './sticker-canvas/sticker-canvas.component';
import {StickerDragStartEvent, StickerPaletteComponent} from './sticker-palette/sticker-palette.component';
import {animateStickerRemoval} from './sticker-canvas/sticker-removal-animation';
import {AnimOnInitDirective} from '../animations/anim-on-init.directive';
import {isPointerOutsideRect, isPositionOutsideCanvas, clamp, radToDeg, pinchDistance, pinchAngle} from './geometry-helpers';

@Component({
  selector: "app-sticker-editor",
  standalone: true,
  imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, StickerCanvasComponent, AnimOnInitDirective],
  templateUrl: "./sticker-editor.component.html",
  host: {"class": "flex flex-col"},
})
export class StickerEditorComponent {
  // ── Inputs / Outputs ──────────────────────────────────────────
  readonly paletteStickers = input<StickerDefinition[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(12);

  readonly placementsChanged = output<StickerPlacement[]>();

  @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

  public readonly placements = signal<StickerPlacement[]>([]);
  public readonly canAddMore = computed(() => this.placements().length < this.maxStickers());

  // ── Palette drag → instant sticker creation ───────────────────

  /** Tracks cleanup for an ongoing palette-initiated drag. */
  private paletteDragCleanup: (() => void) | null = null;
  private readonly removingIds = new Set<string>();

  public onStickerDragFromPaletteStarted(event: StickerDragStartEvent): void {
    if (!this.canAddMore()) return;

    const canvasEl = this.stickerCanvas?.canvasNativeElement;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    // Place sticker at the exact pointer position (canvas-local coords).
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const current = this.placements();
    const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;

    const newPlacement: StickerPlacement = {
      instanceId: this.stickerCanvas?.generateInstanceId()
        ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      stickerId: event.stickerId,
      x,
      y,
      rotation: 0,
      scale: 1,
      zIndex: maxZ + 1,
    };

    const newPlacements = [...current, newPlacement];
    this.placements.set(newPlacements);
    this.placementsChanged.emit(newPlacements);

    // Clean up any previous drag BEFORE setting signals for the new one,
    // so the old cleanup() cannot overwrite paletteDragInProgress / stickerWouldBeDeleted.
    this.paletteDragCleanup?.();

    // Cache the rendered size so the overlay is correct before <img> loads
    this.stickerCanvas.cacheRenderedSize(
      newPlacement.instanceId,
      event.renderedWidth,
      event.renderedHeight,
    );

    // Block canvas input and hide the selection overlay for the entire drag.
    // Both flags set BEFORE selectedInstanceId so nothing flashes.
    this.stickerCanvas.paletteDragInProgress.set(true);
    this.stickerCanvas.stickerWouldBeDeleted.set(true); // starts outside canvas

    // Select the freshly created sticker (overlay hidden via paletteDragInProgress)
    this.stickerCanvas.selectedInstanceId.set(newPlacement.instanceId);
    this.stickerCanvas.lassoSelection.set(new Set());

    // ── Drive move + pinch via window-level pointer events ─────
    const instanceId = newPlacement.instanceId;

    // Entry animation — rAF only so the DOM element exists when GSAP queries it
    requestAnimationFrame(() => {
      const img = canvasEl.querySelector<HTMLElement>(`[data-removal-wrapper-for="${instanceId}"] img`);
      if (img) {
        gsap.fromTo(img,
          {scale: 0.3, transformOrigin: '50% 50%'},
          {scale: 1, duration: 0.18, ease: 'back.out(1.5)', overwrite: true,
           onComplete: () => { gsap.set(img, {clearProps: 'transform,transformOrigin'}); }},
        );
      }
    });

    let stickerX = newPlacement.x;
    let stickerY = newPlacement.y;
    let stickerScale = 1;
    let stickerRotation = 0;

    // Track all active pointers for pinch support
    const pointers = new Map<number, { x: number; y: number }>();
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});

    // Pinch baseline (set when second finger arrives)
    let pinchBaseDist = 0;
    let pinchBaseAngle = 0;
    let pinchBaseScale = 1;
    let pinchBaseRotation = 0;

    // wasInsideCanvas becomes true only after the sticker has crossed INTO the
    // canvas from outside — not if it merely starts there.
    let wasInsideCanvas = false;
    let wasOutside = true; // starts on the palette, so outside by definition

    const isOutside = (evClientX: number, evClientY: number, r: DOMRect): boolean =>
      isPointerOutsideRect(evClientX, evClientY, r) || isPositionOutsideCanvas(stickerX, stickerY, r);

    const updatePlacement = () => {
      const updated = this.placements().map(p =>
        p.instanceId === instanceId
          ? {...p, x: stickerX, y: stickerY, scale: stickerScale, rotation: stickerRotation}
          : p,
      );
      this.placements.set(updated);
      this.placementsChanged.emit(updated);
    };

    const initPinch = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return;
      const pp = {ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y};
      pinchBaseDist = pinchDistance(pp);
      pinchBaseAngle = pinchAngle(pp);
      pinchBaseScale = stickerScale;
      pinchBaseRotation = stickerRotation;
    };

    const onPointerDown2 = (ev: PointerEvent) => {
      pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
      if (pointers.size === 2) initPinch();
    };

    const onMove = (ev: PointerEvent) => {
      if (!pointers.has(ev.pointerId)) return;
      ev.preventDefault();

      const prev = pointers.get(ev.pointerId)!;
      pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});

      const r = canvasEl.getBoundingClientRect();

      if (pointers.size >= 2) {
        // ── Pinch: rotate + scale ──
        const pts = [...pointers.values()];
        const pp = {ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y};
        stickerScale = clamp(pinchBaseScale * (pinchDistance(pp) / pinchBaseDist), 0.2, 4);
        stickerRotation = pinchBaseRotation + radToDeg(pinchAngle(pp) - pinchBaseAngle);
        stickerX += (ev.clientX - prev.x) / 2;
        stickerY += (ev.clientY - prev.y) / 2;
      } else {
        // ── Single finger: move ──
        stickerX += ev.clientX - prev.x;
        stickerY += ev.clientY - prev.y;
      }

      const outside = isOutside(ev.clientX, ev.clientY, r);
      if (wasOutside && !outside) wasInsideCanvas = true;
      wasOutside = outside;
      this.stickerCanvas.stickerWouldBeDeleted.set(!wasInsideCanvas || outside);
      updatePlacement();
      this.stickerCanvas.isMoveActive.set(true);
    };

    const onUp = (ev: PointerEvent) => {
      const prev = pointers.get(ev.pointerId);
      if (prev && pointers.size === 1) {
        stickerX += ev.clientX - prev.x;
        stickerY += ev.clientY - prev.y;
        updatePlacement();
      }

      pointers.delete(ev.pointerId);

      if (pointers.size === 1) return; // second finger lifted, single-finger move continues
      if (pointers.size > 0) return;   // still fingers down

      // All fingers up → finalize
      cleanup();
      const r = canvasEl.getBoundingClientRect();
      const outside = isPointerOutsideRect(ev.clientX, ev.clientY, r) ||
        isPositionOutsideCanvas(stickerX, stickerY, r);

      this.stickerCanvas.isMoveActive.set(false);

      if (outside) {
        this.stickerCanvas.selectedInstanceId.set(null);
        this.stickerCanvas.lassoSelection.set(new Set());
        animateStickerRemoval([instanceId], canvasEl, this.removingIds, () => {
          const updated = this.placements().filter(p => p.instanceId !== instanceId);
          this.placements.set(updated);
          this.placementsChanged.emit(updated);
        });
      } else {
        this.stickerCanvas.stickerWouldBeDeleted.set(false);
        this.stickerCanvas.selectedInstanceId.set(instanceId);
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointerdown', onPointerDown2);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.stickerCanvas.paletteDragInProgress.set(false);
      this.paletteDragCleanup = null;
    };

    window.addEventListener('pointerdown', onPointerDown2);
    window.addEventListener('pointermove', onMove, {passive: false});
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    this.paletteDragCleanup = cleanup;
  }

  // ── Canvas event handlers ─────────────────────────────────────

  public onPlacementsChanged(placements: StickerPlacement[]): void {
    this.placements.set(placements);
    this.placementsChanged.emit(placements);
  }

  public onStickerRemoved(instanceId: string): void {
    const updated = this.placements().filter(p => p.instanceId !== instanceId);
    this.placements.set(updated);
    this.placementsChanged.emit(updated);
  }

  public clearPlacements(): void {
    this.placements.set([]);
    this.placementsChanged.emit([]);
  }

  /** Render the canvas to a PNG data URL (delegates to StickerCanvasComponent). */
  public toDataUrl(): Promise<string> {
    return this.stickerCanvas.toDataUrl();
  }

}
