import {ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, NgZone, OnDestroy, ViewChild} from "@angular/core";
import {capturePointer, releasePointer} from '../../input/pointer-event-utils';

@Component({
  selector: "app-scroll-viewport",
  standalone: true,
  templateUrl: "./scroll-viewport.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block h-full",
  },
})
export class ScrollViewportComponent implements OnDestroy {
  readonly contentVersion = input<unknown>(0);

  private readonly ngZone = inject(NgZone);

  private scrollViewport?: ElementRef<HTMLDivElement>;
  private scrollTrack?: ElementRef<HTMLDivElement>;
  private scrollThumb?: ElementRef<HTMLDivElement>;
  private resizeObserver: ResizeObserver | null = null;
  private updateFrameId: number | null = null;
  private scrollbarDragging = false;
  private scrollbarDragOffsetPx = 0;
  private scrollbarVisible = false;
  private renderedThumbTopPx = -1;
  private renderedThumbHeightPx = -1;
  private autoScrollFrameId: number | null = null;
  private autoScrollSpeedPx = 0;
  private readonly minThumbHeightPx = 44;
  private readonly nativeScrollListener = () => this.requestScrollbarUpdate();

  @ViewChild("scrollViewport") set scrollViewportRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.detachScrollListener();
    this.scrollViewport = ref;
    this.observeScrollViewport();
    this.attachScrollListener();
    this.requestScrollbarUpdate();
  }

  @ViewChild("scrollTrack") set scrollTrackRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.scrollTrack = ref;
    this.requestScrollbarUpdate();
  }

  @ViewChild("scrollThumb") set scrollThumbRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.scrollThumb = ref;
    this.requestScrollbarUpdate();
  }

  constructor() {
    effect(() => {
      this.contentVersion();
      this.requestScrollbarUpdate();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.detachScrollListener();
    if (this.updateFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.updateFrameId);
    }
    this.stopAutoScroll();
  }

  autoScrollForClientY(clientY: number): void {
    const viewport = this.scrollViewport?.nativeElement;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const thresholdPx = Math.min(96, Math.max(48, rect.height * 0.18));
    const topDistance = clientY - rect.top;
    const bottomDistance = rect.bottom - clientY;

    if (topDistance < thresholdPx) {
      this.autoScrollSpeedPx = -this.autoScrollSpeed(topDistance, thresholdPx);
    } else if (bottomDistance < thresholdPx) {
      this.autoScrollSpeedPx = this.autoScrollSpeed(bottomDistance, thresholdPx);
    } else {
      this.autoScrollSpeedPx = 0;
      return;
    }

    this.startAutoScrollLoop();
  }

  stopAutoScroll(): void {
    this.autoScrollSpeedPx = 0;
    if (this.autoScrollFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.autoScrollFrameId);
    }
    this.autoScrollFrameId = null;
  }

  onScrollbarPointerDown(event: PointerEvent): void {
    if (!this.scrollbarVisible) return;
    const track = this.scrollTrack?.nativeElement;
    if (!track) return;

    event.preventDefault();
    event.stopPropagation();
    capturePointer(track, event.pointerId);

    const target = event.target as HTMLElement | null;
    const handle = target?.closest("[data-scrollbar-handle]") as HTMLElement | null;
    if (handle) {
      this.scrollbarDragOffsetPx = event.clientY - handle.getBoundingClientRect().top;
    } else {
      this.scrollbarDragOffsetPx = this.renderedThumbHeightPx / 2;
      this.scrollToScrollbarPointer(event);
    }
    this.scrollbarDragging = true;
  }

  onScrollbarPointerMove(event: PointerEvent): void {
    if (!this.scrollbarDragging) return;
    event.preventDefault();
    this.scrollToScrollbarPointer(event);
  }

  onScrollbarPointerUp(event: PointerEvent): void {
    if (!this.scrollbarDragging) return;
    this.scrollbarDragging = false;
    const track = this.scrollTrack?.nativeElement;
    if (track) {
      releasePointer(track, event.pointerId);
    }
  }

  private observeScrollViewport(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const viewport = this.scrollViewport?.nativeElement;
    if (!viewport || typeof ResizeObserver === "undefined") return;

    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.requestScrollbarUpdate());
      this.resizeObserver.observe(viewport);
      if (viewport.firstElementChild) {
        this.resizeObserver.observe(viewport.firstElementChild);
      }
    });
  }

  private attachScrollListener(): void {
    const viewport = this.scrollViewport?.nativeElement;
    if (!viewport) return;
    this.ngZone.runOutsideAngular(() => {
      viewport.addEventListener("scroll", this.nativeScrollListener, {passive: true});
    });
  }

  private detachScrollListener(): void {
    this.scrollViewport?.nativeElement.removeEventListener("scroll", this.nativeScrollListener);
  }

  private requestScrollbarUpdate(): void {
    if (this.updateFrameId !== null) return;
    if (typeof requestAnimationFrame === "undefined") {
      this.updateFrameId = window.setTimeout(() => {
        this.updateFrameId = null;
        this.updateScrollbar();
      }, 0);
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      this.updateFrameId = requestAnimationFrame(() => {
        this.updateFrameId = null;
        this.updateScrollbar();
      });
    });
  }

  private updateScrollbar(): void {
    const viewport = this.scrollViewport?.nativeElement;
    const track = this.scrollTrack?.nativeElement;
    const thumb = this.scrollThumb?.nativeElement;
    if (!viewport || !track || !thumb) {
      this.setScrollbarVisible(false);
      return;
    }

    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const trackHeight = track.clientHeight;
    if (maxScroll <= 2 || trackHeight <= 0) {
      this.setScrollbarVisible(false);
      this.renderThumb(0, 0);
      return;
    }

    const thumbHeight = this.scrollbarThumbHeight(viewport, trackHeight);
    const thumbTravel = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = thumbTravel === 0 ? 0 : (viewport.scrollTop / maxScroll) * thumbTravel;
    this.setScrollbarVisible(true);
    this.renderThumb(this.clamp(thumbTop, 0, thumbTravel), thumbHeight);
  }

  private scrollToScrollbarPointer(event: PointerEvent): void {
    const viewport = this.scrollViewport?.nativeElement;
    const track = this.scrollTrack?.nativeElement;
    if (!viewport || !track) return;

    const trackRect = track.getBoundingClientRect();
    const thumbHeight = this.renderedThumbHeightPx;
    const maxThumbTop = Math.max(0, trackRect.height - thumbHeight);
    const desiredThumbTop = this.clamp(event.clientY - trackRect.top - this.scrollbarDragOffsetPx, 0, maxThumbTop);
    const scrollRatio = maxThumbTop === 0 ? 0 : desiredThumbTop / maxThumbTop;
    viewport.scrollTop = scrollRatio * (viewport.scrollHeight - viewport.clientHeight);
    this.updateScrollbar();
  }

  private startAutoScrollLoop(): void {
    if (this.autoScrollFrameId !== null || typeof requestAnimationFrame === "undefined") return;

    this.ngZone.runOutsideAngular(() => {
      const tick = () => {
        this.autoScrollFrameId = null;
        const viewport = this.scrollViewport?.nativeElement;
        if (!viewport || this.autoScrollSpeedPx === 0) return;

        viewport.scrollTop += this.autoScrollSpeedPx;
        this.requestScrollbarUpdate();
        this.autoScrollFrameId = requestAnimationFrame(tick);
      };
      this.autoScrollFrameId = requestAnimationFrame(tick);
    });
  }

  private autoScrollSpeed(edgeDistancePx: number, thresholdPx: number): number {
    const pressure = this.clamp(1 - edgeDistancePx / thresholdPx, 0, 1);
    return Math.ceil(4 + pressure * 18);
  }

  private setScrollbarVisible(visible: boolean): void {
    if (this.scrollbarVisible === visible) return;
    this.scrollbarVisible = visible;
    const track = this.scrollTrack?.nativeElement;
    if (!track) return;
    track.classList.toggle("opacity-0", !visible);
    track.classList.toggle("pointer-events-none", !visible);
  }

  private scrollbarThumbHeight(viewport: HTMLElement, trackHeight: number): number {
    const proportionalHeight = trackHeight * viewport.clientHeight / Math.max(1, viewport.scrollHeight);
    const minHeight = Math.min(this.minThumbHeightPx, trackHeight);

    return this.clamp(proportionalHeight, minHeight, trackHeight);
  }

  private renderThumb(topPx: number, heightPx: number): void {
    const thumb = this.scrollThumb?.nativeElement;
    if (!thumb) return;

    const roundedTop = Math.round(topPx * 10) / 10;
    const roundedHeight = Math.round(heightPx * 10) / 10;

    if (this.renderedThumbHeightPx !== roundedHeight) {
      this.renderedThumbHeightPx = roundedHeight;
      thumb.style.height = `${roundedHeight}px`;
    }

    if (this.renderedThumbTopPx !== roundedTop) {
      this.renderedThumbTopPx = roundedTop;
      thumb.style.transform = `translate3d(-50%, ${roundedTop}px, 0)`;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
