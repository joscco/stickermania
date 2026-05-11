import {AfterViewInit, Component, computed, DestroyRef, ElementRef, inject, input, OnDestroy, output, signal, ViewChild,} from "@angular/core";
import {DrawingCanvasComponent} from '../../../shared/paint-canvas/drawing-canvas.component';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../shared/svg/svg.component';


@Component({
  selector: "app-lobby-avatar",
  standalone: true,
  imports: [DrawingCanvasComponent, AnimOnInitDirective, AnimGroupDirective, SvgComponent],
  templateUrl: './lobby-avatar.component.html',
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class LobbyAvatarComponent implements AfterViewInit, OnDestroy {
  public readonly playerName = input.required<string>();
  public readonly initialAvatarImage = input<string | null>(null);
  public readonly avatarSubmitted = output<string>();
  public readonly skipped = output<void>();

  public drawMode = signal<"big" | "small" | "erase">("big");

  private readonly el = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostWidth = signal(400);
  private readonly hostHeight = signal(600);
  private resizeObserver?: ResizeObserver;

  /** Measured heights of sections (set once after view init) */
  private titleH = 0;
  private buttonsH = 0;

  /** Computed canvas square side length — fits in remaining space */
  public readonly canvasSide = computed(() => {
    const w = this.hostWidth();
    const h = this.hostHeight();
    const chrome = this.titleH + this.buttonsH + 32; // padding + gaps
    const availableH = Math.max(h - chrome, 100);
    return Math.max(Math.min(w, availableH), 80);
  });

  /** Brush icon size scales with canvas side */
  public readonly brushSize = computed(() => {
    const s = this.canvasSide();
    return s / 5;
  });

  @ViewChild("drawingCanvas") drawingCanvas!: DrawingCanvasComponent;
  @ViewChild("titleRef") titleRef!: ElementRef<HTMLElement>;
  @ViewChild("buttonsRef") buttonsRef!: ElementRef<HTMLElement>;

  public ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.hostWidth.set(this.el.nativeElement.clientWidth);
      this.hostHeight.set(this.el.nativeElement.clientHeight);
    });
    this.resizeObserver.observe(this.el.nativeElement);
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());

    // Measure static section heights after a tick
    setTimeout(() => {
      this.titleH = this.titleRef?.nativeElement?.offsetHeight ?? 50;
      this.buttonsH = this.buttonsRef?.nativeElement?.offsetHeight ?? 120;
    });
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  public clear(): void {
    this.drawingCanvas.clear();
  }

  public submit(): void {
    this.drawingCanvas.submit();
  }

  protected selectThinBrush() {
    this.drawMode.set("small");
  }

  protected selectThickBrush() {
    this.drawMode.set("big");
  }

  protected selectEraser() {
    this.drawMode.set("erase");
  }
}
