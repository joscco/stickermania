import {Component, input, output, signal, viewChild, ElementRef, AfterViewInit, OnDestroy, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import gsap from "gsap";
import {SvgComponent} from "../svg/svg.component";

interface PlacedSticker {
  id: string;
  pos: {x: number; y: number};
}

@Component({
  selector: "app-sticker-board",
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: "./sticker-board.component.html",
  host: {"class": "block w-full h-full relative select-none"},
})
export class StickerBoardComponent implements AfterViewInit, OnDestroy {
  /** Background SVG sprite ref (e.g. "sprite:#sticker-shapes-star") */
  readonly backgroundSvg = input<string | null>(null);

  readonly backgroundSvgId = computed(() => {
    const s = this.backgroundSvg();
    if (!s) return null;
    return s.startsWith('sprite:#') ? s.replace('sprite:#', '') : s;
  });

  /** SVG sprite names for the draggable stickers */
  readonly stickerNames = input.required<string[]>();

  /** Initial positions {x, y} in percentage 0-100 per sticker */
  readonly initialPositions = input<Array<{x: number; y: number}> | null>(null);

  /** Emitted when any sticker is moved */
  readonly positionChanged = output<Array<{stickerId: string; x: number; y: number}>>();

  /** Emitted when user confirms placement */
  readonly confirmed = output<void>();

  /** Which sticker is currently active (index into stickerNames) */
  readonly activeIndex = signal(0);

  /** Positions for all stickers (index → %) */
  readonly positions = signal<Array<{x: number; y: number}>>([{x: 50, y: 50}]);

  readonly isDragging = signal(false);

  /** Full data for external consumers */
  public getPositions(): Array<{stickerId: string; x: number; y: number}> {
    return this.positions().map((p, i) => ({
      stickerId: this.stickerNames()[i] ?? this.stickerNames()[0],
      x: p.x,
      y: p.y,
    }));
  }

  private readonly boardEl = viewChild<ElementRef<HTMLElement>>("board");
  private readonly stickerContainer = viewChild<ElementRef>("stickerContainer");

  private animState: Map<number, 'entering' | 'settling' | 'idle'> = new Map();
  private dragOffset = {x: 0, y: 0};

  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundPointerUp = () => this.onPointerUp();

  /** Sticker entries derived from inputs */
  readonly stickers = computed(() => {
    const names = this.stickerNames();
    const positions = this.positions();
    return names.map((name, i) => ({
      name,
      pos: positions[i] ?? {x: 50, y: 50},
      index: i,
    }));
  });

  ngAfterViewInit(): void {
    const init = this.initialPositions();
    if (init && init.length > 0) {
      this.positions.set(init.slice(0, this.stickerNames().length));
    } else {
      this.positions.set(this.stickerNames().map(() => ({x: 50, y: 50})));
    }
    document.addEventListener("pointermove", this.boundPointerMove);
    document.addEventListener("pointerup", this.boundPointerUp);
    this.runEnteringAnimations();
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointermove", this.boundPointerMove);
    document.removeEventListener("pointerup", this.boundPointerUp);
  }

  /** Select a sticker to drag (or deselect others when clicking board) */
  selectSticker(index: number): void {
    this.activeIndex.set(index);
  }

  onBoardPointerDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest("[data-sticker]")) return;
    // Place active sticker at click position
    this.positions.update(arr => {
      const next = [...arr];
      const i = this.activeIndex();
      if (i >= 0 && i < next.length) {
        next[i] = this.eventToPercent(e);
      }
      return next;
    });
    this.runSettlingAnimation(this.activeIndex());
    this.emitPositions();
  }

  onStickerPointerDown(e: PointerEvent, index: number): void {
    e.preventDefault();
    e.stopPropagation();
    this.selectSticker(index);
    this.isDragging.set(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const board = this.boardEl()?.nativeElement;
    if (!board) return;
    const percent = this.eventToPercent(e);
    const current = this.positions()[index] ?? {x: 50, y: 50};
    this.dragOffset = {
      x: current.x - percent.x,
      y: current.y - percent.y,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging()) return;
    const idx = this.activeIndex();
    this.positions.update(arr => {
      const next = [...arr];
      if (idx >= 0 && idx < next.length) {
        const raw = this.eventToPercent(e);
        next[idx] = {
          x: Math.max(2, Math.min(98, raw.x + this.dragOffset.x)),
          y: Math.max(2, Math.min(98, raw.y + this.dragOffset.y)),
        };
      }
      return next;
    });
  }

  private onPointerUp(): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    this.runSettlingAnimation(this.activeIndex());
    this.emitPositions();
  }

  private emitPositions(): void {
    this.positionChanged.emit(this.getPositions());
  }

  private eventToPercent(e: PointerEvent): {x: number; y: number} {
    const board = this.boardEl()?.nativeElement;
    if (!board) return {x: 50, y: 50};
    const rect = board.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  private runEnteringAnimations(): void {
    this.stickerNames().forEach((_, i) => {
      this.animState.set(i, 'entering');
    });
    // GSAP stagger - animate all stickers entering
    const container = this.stickerContainer()?.nativeElement;
    if (!container) return;
    const els = container.querySelectorAll('[data-sticker]');
    gsap.set(els, {scale: 0.5, opacity: 0});
    gsap.to(els, {
      scale: 1,
      opacity: 1,
      duration: 0.2,
      stagger: 0.08,
      ease: 'back.out(3)',
      clearProps: 'opacity',
      onComplete: () => {
        this.stickerNames().forEach((_, i) => this.animState.set(i, 'idle'));
      },
    });
  }

  private runSettlingAnimation(index: number): void {
    if (this.animState.get(index) === 'entering') return;
    const container = this.stickerContainer()?.nativeElement;
    if (!container) return;
    const el = container.querySelectorAll('[data-sticker]')[index] as HTMLElement;
    if (!el) return;
    this.animState.set(index, 'settling');
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
          this.animState.set(index, 'idle');
        },
      },
    );
  }
}
