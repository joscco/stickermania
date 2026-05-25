import {Component, input, output, signal, viewChild, ElementRef, AfterViewInit, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import gsap from "gsap";
import {SvgComponent} from "../svg/svg.component";

/**
 * Simplified sticker board: drag a single sticker on a background.
 * Based on the old StickerEditor drag logic but stripped to the essentials:
 * - One sticker at a time
 * - Drag to position (x, y in %)
 * - No rotation, no scale, no multi-select, no z-order, no grouping
 *
 * Animations (GSAP):
 *   entering  → scale+bounce pop in when the sticker first appears
 *   settling  → spring bounce after dropping (pointer up)
 *   idle       → no animation running
 */

@Component({
  selector: "app-sticker-board",
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: "./sticker-board.component.html",
  host: {"class": "block w-full h-full relative select-none"},
})
export class StickerBoardComponent implements AfterViewInit, OnDestroy {
  /** Background image URL (e.g. a figure silhouette) */
  readonly backgroundImage = input<string | null>(null);

  /** SVG sprite name for the draggable sticker */
  readonly stickerName = input.required<string>();

  /** Initial position {x, y} in percentage 0-100 */
  readonly initialPosition = input<{x: number; y: number} | null>(null);

  /** Emitted when sticker is moved */
  readonly positionChanged = output<{x: number; y: number}>();

  /** Emitted when user confirms placement */
  readonly confirmed = output<void>();

  readonly position = signal<{x: number; y: number}>({x: 50, y: 50});
  readonly isDragging = signal(false);

  private readonly boardEl = viewChild<ElementRef<HTMLElement>>("board");
  private readonly stickerEl = viewChild<ElementRef<HTMLElement>>("sticker");

  private animState: 'entering' | 'settling' | 'idle' = 'idle';

  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundPointerUp = () => this.onPointerUp();

  ngAfterViewInit(): void {
    const init = this.initialPosition();
    if (init) this.position.set(init);
    document.addEventListener("pointermove", this.boundPointerMove);
    document.addEventListener("pointerup", this.boundPointerUp);
    this.runEnteringAnimation();
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointermove", this.boundPointerMove);
    document.removeEventListener("pointerup", this.boundPointerUp);
  }

  onBoardPointerDown(e: PointerEvent): void {
    const board = this.boardEl()?.nativeElement;
    if (!board) return;
    // If clicking on the sticker, let the sticker handler deal with it
    if ((e.target as HTMLElement).closest("[data-sticker]")) return;
    // Otherwise place sticker at click position
    this.updatePositionFromEvent(e);
    this.runSettlingAnimation();
    this.positionChanged.emit(this.position());
  }

  onStickerPointerDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging()) return;
    this.updatePositionFromEvent(e);
  }

  private onPointerUp(): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    this.runSettlingAnimation();
    this.positionChanged.emit(this.position());
  }

  private updatePositionFromEvent(e: PointerEvent): void {
    const board = this.boardEl()?.nativeElement;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    this.position.set({
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y)),
    });
  }

  private runEnteringAnimation(): void {
    const el = this.stickerEl()?.nativeElement;
    if (!el) return;
    this.animState = 'entering';
    gsap.set(el, {scale: 0.5, opacity: 0});
    gsap.to(el, {
      scale: 1,
      opacity: 1,
      duration: 0.2,
      ease: 'back.out(3)',
      clearProps: 'opacity',
      onComplete: () => {
        this.animState = 'idle';
      },
    });
  }

  private runSettlingAnimation(): void {
    const el = this.stickerEl()?.nativeElement;
    if (!el) return;
    if (this.animState === 'entering') return;
    this.animState = 'settling';
    gsap.fromTo(el,
      {scaleX: 1.03, scaleY: 0.98},
      {
        scaleX: 1,
        scaleY: 1,
        duration: 0.35,
        ease: 'back.out(3)',
        transformOrigin: '50% 50%',
        clearProps: 'transform',
        onComplete: () => {
          this.animState = 'idle';
        },
      },
    );
  }

  onConfirm(): void {
    this.confirmed.emit();
  }
}
