import {AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, inject, input} from "@angular/core";
import {
  installDirectManipulationGuards,
  type DirectManipulationGuardOptions,
} from "./interaction-surface-guards";
import type {PointerSurfaceHandlerLike} from "./pointer-surface-handler";

export type PointerSurfaceOptions = {
  guards?: DirectManipulationGuardOptions;
  preventContextMenu?: boolean;
};

type RegisteredListener = {
  eventName: string;
  listener: EventListener;
  options: AddEventListenerOptions;
};

@Directive({
  selector: "[appPointerSurface]",
  standalone: true,
})
export class PointerSurfaceDirective implements AfterViewInit, OnDestroy {
  readonly pointerSurfaceHandler = input.required<PointerSurfaceHandlerLike>();
  readonly pointerSurfaceOptions = input<PointerSurfaceOptions>({});

  private readonly ngZone = inject(NgZone);

  private removeGuards: (() => void) | null = null;
  private readonly registeredListeners: RegisteredListener[] = [];

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      const element = this.elementRef.nativeElement;
      const options = this.pointerSurfaceOptions();

      this.removeGuards = installDirectManipulationGuards(element, options.guards);

      this.addListener("pointerdown", event => this.handler().pointerDown?.(event as PointerEvent));
      this.addListener("pointermove", event => this.handler().pointerMove?.(event as PointerEvent));
      this.addListener("pointerup", event => this.handler().pointerUp?.(event as PointerEvent));
      this.addListener("pointercancel", event => this.handler().pointerCancel?.(event as PointerEvent));
      this.addListener("wheel", event => this.handler().wheel?.(event as WheelEvent));

      if (options.preventContextMenu ?? true) {
        this.addListener("contextmenu", event => event.preventDefault());
      }
    });
  }

  ngOnDestroy(): void {
    const element = this.elementRef.nativeElement;

    this.removeGuards?.();
    this.removeGuards = null;

    for (const {eventName, listener, options} of this.registeredListeners) {
      element.removeEventListener(eventName, listener, options);
    }

    this.registeredListeners.length = 0;
  }

  private addListener(
    eventName: string,
    listener: EventListener,
    options: AddEventListenerOptions = {passive: false},
  ): void {
    const element = this.elementRef.nativeElement;

    element.addEventListener(eventName, listener, options);
    this.registeredListeners.push({eventName, listener, options});
  }

  private handler(): PointerSurfaceHandlerLike {
    return this.pointerSurfaceHandler();
  }
}
