import {AfterViewChecked, Component, ElementRef, OnDestroy, ViewChild, computed, input, output} from "@angular/core";
import gsap from "gsap";
import {
  BRUSH_SIZES,
  PAINT_COLORS,
  STICKER_OUTLINE_WIDTHS,
  type PaintEraserMode,
  type PaintTool,
  type StickerOutlineWidth,
} from "../shared/sticker-creator-types";
import {StickerCreatorPaintToolButtonComponent} from "./sticker-creator-paint-tool-button.component";
import {paintToolUsesBrushSize} from "./paint-tool-ui";
import {SvgComponent} from '../../../../../shared/ui/svg/svg.component';
import {AnimOnInitDirective} from '../../../../../shared/ui/animations/anim-on-init.directive';
import {STICKERMANIA_COLORS} from "../../../../../shared/theme/stickermania-theme";

@Component({
  selector: "app-sticker-creator-paint-toolbar",
  standalone: true,
  imports: [AnimOnInitDirective, StickerCreatorPaintToolButtonComponent, SvgComponent],
  templateUrl: "./sticker-creator-paint-toolbar.component.html",
})
export class StickerCreatorPaintToolbarComponent implements AfterViewChecked, OnDestroy {
  readonly toolbarVisible = input.required<boolean>();
  readonly currentToolLabel = input.required<string>();
  readonly paintTool = input.required<PaintTool>();
  readonly eraserMode = input.required<PaintEraserMode>();
  readonly paintColor = input.required<(typeof PAINT_COLORS)[number]>();
  readonly brushSize = input.required<(typeof BRUSH_SIZES)[number]>();
  readonly stickerOutlineWidth = input.required<StickerOutlineWidth>();
  readonly canUndoPaintStep = input(false);

  readonly toolbarClosed = output<void>();
  readonly toolbarToggled = output<void>();
  readonly toolSelected = output<PaintTool>();
  readonly eraserModeSelected = output<PaintEraserMode>();
  readonly colorSelected = output<(typeof PAINT_COLORS)[number]>();
  readonly brushSizeSelected = output<(typeof BRUSH_SIZES)[number]>();
  readonly stickerOutlineWidthSelected = output<StickerOutlineWidth>();
  readonly undoRequested = output<void>();
  readonly resetRequested = output<void>();

  readonly paintColors = PAINT_COLORS;
  readonly brushSizes = BRUSH_SIZES;
  readonly stickerOutlineWidths = STICKER_OUTLINE_WIDTHS;
  readonly paintToolUsesColor = computed(() => this.paintTool() === "brush" || this.paintTool() === "fill");
  readonly paintToolUsesBrushSize = computed(() => paintToolUsesBrushSize(this.paintTool()));
  readonly brushSizeBadgeScale = computed(() => this.sizeBadgeScale(this.brushSize()));
  readonly outlineSizeBadgeScale = computed(() => this.sizeBadgeScaleForOutline(this.stickerOutlineWidth()));
  readonly activeColorNeedsBorder = computed(() => this.paintColor().toLowerCase() === STICKERMANIA_COLORS.white);
  readonly activeColorForeground = computed(() => this.paintColor().toLowerCase() === STICKERMANIA_COLORS.ink ? STICKERMANIA_COLORS.white : null);

  @ViewChild("toolbarPanel") private toolbarPanel?: ElementRef<HTMLDivElement>;
  @ViewChild("toolbarContent") private toolbarContent?: ElementRef<HTMLDivElement>;
  @ViewChild("toolLabel") private toolLabel?: ElementRef<HTMLDivElement>;

  private resizeObserver: ResizeObserver | null = null;
  private toolbarAnimationFrame: number | null = null;
  private lastToolbarLayoutKey = "";
  private lastToolLabel: string | null = null;

  ngAfterViewChecked(): void {
    this.installResizeObserver();
    this.updateToolbarAnimationState();
    this.updateToolLabelAnimationState();
  }

  ngOnDestroy(): void {
    if (this.toolbarAnimationFrame !== null) {
      cancelAnimationFrame(this.toolbarAnimationFrame);
    }

    this.resizeObserver?.disconnect();

    if (this.toolbarPanel) {
      gsap.killTweensOf(this.toolbarPanel.nativeElement);
    }

    if (this.toolLabel) {
      gsap.killTweensOf(this.toolLabel.nativeElement);
    }
  }

  stickerOutlineLabel(width: StickerOutlineWidth): string {
    switch (width) {
      case 0:
        return "Aus";
      case 12:
        return "Fein";
      case 24:
        return "Mittel";
      case 40:
        return "Dick";
    }
  }

  sizeBadgeScale(size: (typeof BRUSH_SIZES)[number]): number {
    return 2 + 1.5 * BRUSH_SIZES.indexOf(size);
  }

  sizeBadgeScaleForOutline(size: StickerOutlineWidth): number {
    return 2 + 2 * STICKER_OUTLINE_WIDTHS.indexOf(size);
  }

  private installResizeObserver(): void {
    if (this.resizeObserver || typeof ResizeObserver === "undefined" || !this.toolbarContent) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.scheduleToolbarHeightAnimation());
    this.resizeObserver.observe(this.toolbarContent.nativeElement);
  }

  private updateToolbarAnimationState(): void {
    const layoutKey = [
      this.toolbarVisible() ? "open" : "closed",
      this.currentToolLabel(),
      this.paintTool(),
    ].join("|");

    if (layoutKey === this.lastToolbarLayoutKey) {
      return;
    }

    this.lastToolbarLayoutKey = layoutKey;
    this.scheduleToolbarHeightAnimation();
  }

  private updateToolLabelAnimationState(): void {
    const label = this.currentToolLabel();

    if (this.lastToolLabel === null) {
      this.lastToolLabel = label;
      return;
    }

    if (label === this.lastToolLabel) {
      return;
    }

    this.lastToolLabel = label;
    this.animateToolLabelChange();
  }

  private scheduleToolbarHeightAnimation(): void {
    if (this.toolbarAnimationFrame !== null) {
      cancelAnimationFrame(this.toolbarAnimationFrame);
    }

    this.toolbarAnimationFrame = requestAnimationFrame(() => {
      this.toolbarAnimationFrame = null;
      this.animateToolbarHeight();
    });
  }

  private animateToolbarHeight(): void {
    const panel = this.toolbarPanel?.nativeElement;
    const content = this.toolbarContent?.nativeElement;

    if (!panel || !content) {
      return;
    }

    const currentHeight = panel.getBoundingClientRect().height;
    const targetHeight = this.toolbarVisible() ? this.measureOpenToolbarHeight(panel, content) : 0;

    gsap.killTweensOf(panel);

    if (Math.abs(currentHeight - targetHeight) < 0.5) {
      panel.style.height = `${targetHeight}px`;
      return;
    }

    panel.style.willChange = "height";
    gsap.fromTo(
      panel,
      {height: currentHeight},
      {
        height: targetHeight,
        duration: 0.3,
        ease: "back.out",
        onComplete: () => {
          panel.style.height = `${targetHeight}px`;
          panel.style.willChange = "";
        },
      },
    );
  }

  private measureOpenToolbarHeight(panel: HTMLElement, content: HTMLElement): number {
    const panelStyles = getComputedStyle(panel);
    const paddingTop = Number.parseFloat(panelStyles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(panelStyles.paddingBottom) || 0;

    return Math.ceil(content.getBoundingClientRect().height + paddingTop + paddingBottom);
  }

  private animateToolLabelChange(): void {
    const label = this.toolLabel?.nativeElement;

    if (!label || !this.toolbarVisible()) {
      return;
    }

    gsap.killTweensOf(label);
    gsap.fromTo(
      label,
      {opacity: 0, scale: 0.985},
      {
        opacity: 1,
        scale: 1,
        duration: 0.22,
        ease: "back.out",
        clearProps: "opacity,transform",
      },
    );
  }
}
