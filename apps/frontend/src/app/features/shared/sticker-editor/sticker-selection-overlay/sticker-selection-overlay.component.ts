import {Component, input, output, computed, signal, OnDestroy, AfterViewInit, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import gsap from 'gsap';
import {IconComponent} from '../../icon/icon.component';
import {BoundingBox} from '../sticker-types';
import {degToRad, rotatePt, radToDeg, angleBetween} from '../geometry-helpers';

export interface HandleDragEvent {
  handle: 'scale' | 'rotate' | 'n' | 's' | 'e' | 'w';
  dx: number;
  dy: number;
  done: boolean;
}

export type OverlayMode = 'idle' | 'moving' | 'rotating' | 'scaling' | 'menu';

export const DARK_PURPLE = 'oklch(55.8% 0.288 302.321)'
export const LIGHT_PURPLE = 'oklch(62.7% 0.265 303.9)'
export const LIGHT_PURPLE_SEMI = 'oklch(62.7% 0.265 303.9 / .5)'



@Component({
  selector: 'app-sticker-selection-overlay',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './sticker-selection-overlay.component.html',
  host: {style: 'position:absolute;inset:0;pointer-events:none;'},
})
export class StickerSelectionOverlayComponent implements AfterViewInit, OnDestroy {
  readonly padding = input<number>(0)
  readonly box = input<BoundingBox | null>(null);
  readonly rotation = input<number>(0);
  readonly stretchModeVisible = input<boolean>(false);
  /** Whether the parent is currently handling a move/drag gesture. */
  readonly isDragging = input<boolean>(false);
  /** Whether the context menu is currently open. */
  readonly isMenuOpen = input<boolean>(false);

  readonly handleDrag = output<HandleDragEvent>();
  readonly menuToggle = output<void>();

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {
  }

  ngAfterViewInit(): void {
    // Fade in all handle circles + SVG on creation.
    // Only animate opacity — no scale/transform tweens on positioned elements,
    // because Angular updates their left/top every frame during moves.
    const el = this.hostRef.nativeElement;
    const targets = el.querySelectorAll<HTMLElement>('div[style*="pointer-events:auto"], svg');
    if (targets.length) {
      gsap.fromTo(targets,
        {opacity: 0},
        {
          opacity: 1, duration: 0.18, ease: 'power2.out', stagger: 0.02,
          clearProps: 'opacity'
        },
      );
    }
  }

  // ── Internal drag tracking ────────────────────────────────────────────────
  private internalMode = signal<'idle' | 'rotating' | 'scaling'>('idle');
  private lastX = 0;
  private lastY = 0;
  private lastAngle = 0;
  private cleanupPtr: (() => void) | null = null;

  // ── Derived active mode (single source of truth for the template) ─────────
  readonly activeMode = computed<OverlayMode>(() => {
    if (this.internalMode() !== 'idle') return this.internalMode();
    if (this.isDragging()) return 'moving';
    if (this.isMenuOpen()) return 'menu';
    return 'idle';
  });

  protected readonly Math = Math;
  protected readonly rotatePt = rotatePt;
  protected readonly svgRect = (tl: { x: number; y: number }, tr: { x: number; y: number },
                                br: { x: number; y: number }, bl: { x: number; y: number }) =>
    `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

  readonly sides = computed(() => {
    const b = this.box();
    if (!b) return [];
    const pad = this.padding();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rad = degToRad(this.rotation());
    return [
      {id: 'n' as const, lx: b.x + b.w / 2, ly: b.y - pad, cursor: 'n-resize'},
      {id: 's' as const, lx: b.x + b.w / 2, ly: b.y + b.h + pad, cursor: 's-resize'},
      {id: 'e' as const, lx: b.x + b.w + pad, ly: b.y + b.h / 2, cursor: 'e-resize'},
      {id: 'w' as const, lx: b.x - pad, ly: b.y + b.h / 2, cursor: 'w-resize'},
    ].map(r => {
      const p = rotatePt(r.lx, r.ly, cx, cy, rad);
      return {...r, x: p.x, y: p.y};
    });
  });

  onHandleDown(ev: PointerEvent, handle: HandleDragEvent['handle']): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.internalMode.set(handle === 'rotate' ? 'rotating' : 'scaling');
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;

    const canvasEl = (ev.target as HTMLElement).closest('[data-canvas-overlay]')?.parentElement ?? null;
    const canvasRect = canvasEl?.getBoundingClientRect() ?? null;

    if (handle === 'rotate' && canvasRect) {
      const b = this.box()!;
      this.lastAngle = angleBetween(canvasRect.left + b.x + b.w / 2, canvasRect.top + b.y + b.h / 2, ev.clientX, ev.clientY);
    }

    const onMove = (e: PointerEvent) => {
      if (this.internalMode() === 'idle') return;
      if (this.internalMode() === 'rotating' && canvasRect) {
        const b = this.box()!;
        const angle = angleBetween(canvasRect.left + b.x + b.w / 2, canvasRect.top + b.y + b.h / 2, e.clientX, e.clientY);
        let delta = radToDeg(angle - this.lastAngle);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        this.lastAngle = angle;
        if (Math.abs(delta) > 0.05) {
          this.handleDrag.emit({handle: 'rotate', dx: delta, dy: 0, done: false});
        }
        return;
      }
      const screenDx = e.clientX - this.lastX;
      const screenDy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (Math.abs(screenDx) < 0.5 && Math.abs(screenDy) < 0.5) {
        return;
      }
      const local = rotatePt(screenDx, screenDy, 0, 0, -degToRad(this.rotation()));
      this.handleDrag.emit({handle, dx: local.x, dy: local.y, done: false});
    };
    const onUp = () => {
      if (this.internalMode() !== 'idle') this.handleDrag.emit({handle, dx: 0, dy: 0, done: true});
      this.internalMode.set('idle');
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.cleanupPtr = null;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    this.cleanupPtr = cleanup;
  }

  ngOnDestroy(): void {
    this.cleanupPtr?.();
  }

  protected readonly DARK_PURPLE = DARK_PURPLE;
  protected readonly LIGHT_PURPLE = LIGHT_PURPLE;
  protected readonly LIGHT_PURPLE_SEMI = LIGHT_PURPLE_SEMI;
}
