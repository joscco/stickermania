import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import type { TeamGraffitiHouse } from "@birthday/shared";
import { GraffitiPlayerService } from "./graffiti-player.service";
import { GestureInterpreter } from "../../player/gesture-interpreter";
import { ViewportController } from "../../player/viewport-controller";
import { Point, Size } from "../../player/types";

/** Logical px height of house sprites for hit-testing */
const HOUSE_HEIGHT = 160;
const HOUSE_WIDTH = 120;

@Component({
  selector: "app-graffiti-viewport",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex flex-col relative">
      <!-- HUD overlay: action budget -->
      <div class="absolute top-3 left-3 z-20 rounded-2xl bg-white/90 backdrop-blur shadow-lg px-3 py-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold">{{ graffiti.myActions() }}</span>
          <div class="flex gap-0.5">
            @for (i of actionDots(); track i) {
              <div class="w-2 h-2 rounded-full transition-colors"
                   [class.bg-blue-500]="graffiti.currentTeamId() === 'DIAMOND' && i < graffiti.myActions()"
                   [class.bg-rose-500]="graffiti.currentTeamId() === 'HEART' && i < graffiti.myActions()"
                   [class.bg-stone-200]="i >= graffiti.myActions()"></div>
            }
          </div>
        </div>
      </div>

      <!-- Team badge -->
      <div class="absolute top-3 right-3 z-20 rounded-2xl bg-white/90 backdrop-blur shadow-lg px-3 py-2 text-lg">
        {{ graffiti.currentTeamId() === 'DIAMOND' ? '♦️' : '♥️' }}
      </div>

      <!-- Viewport -->
      <div
        class="flex-1 relative overflow-hidden bg-amber-50/30"
        #viewport
        style="touch-action: none;"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        (wheel)="onWheel($event)"
      >
        <div class="absolute left-0 top-0 origin-top-left" style="touch-action: none;" [style.transform]="contentTransform()">
          <!-- City scene -->
          <div class="relative select-none"
               [style.width.px]="graffiti.sceneWidth()"
               [style.height.px]="graffiti.sceneHeight()">
            <!-- Subtle grid -->
            <div class="absolute inset-0 opacity-[0.04]"
                 style="background-image: radial-gradient(circle, #000 0.6px, transparent 0.6px); background-size: 40px 40px;"></div>

            <!-- Houses (not clickable — tap is handled via gesture hit-test) -->
            @for (house of graffiti.houses(); track house.id) {
              <div class="absolute pointer-events-none"
                   [style.left.px]="house.x"
                   [style.top.px]="house.y"
                   style="transform: translate(-50%, -100%);">
                <img [src]="graffiti.houseImageUrl(house)"
                     class="w-auto drop-shadow-md"
                     style="height: 160px;"
                     [style.transform]="house.flipped ? 'scaleX(-1)' : ''"
                     alt="" draggable="false" />
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class GraffitiViewportComponent implements AfterViewInit, OnDestroy {
  public readonly graffiti = inject(GraffitiPlayerService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild("viewport") private viewportRef!: ElementRef<HTMLElement>;

  public readonly viewportCtrl = new ViewportController({
    minScale: 0.25,
    maxScale: 2.5,
    overscrollPx: 60,
  });

  private readonly gesture = new GestureInterpreter({
    callbacks: {
      onPan: (delta) => this.onPan(delta),
      onPanEnd: (velocity) => this.onPanEnd(velocity),
      onPinch: (center, factor, centerDelta) => this.onPinch(center, factor, centerDelta),
      onTap: (clientPoint) => this.onTap(clientPoint),
      onWheelZoom: (clientPoint, factor) => this.onWheelZoom(clientPoint, factor),
    },
    tapMaxDurationMs: 300,
    tapMoveThresholdPx: 12,
  });

  private removeMobileTouchHandlers: (() => void) | null = null;

  public readonly actionDots = computed(() => {
    const max = this.graffiti.maxActions();
    return Array.from({ length: max }, (_, i) => i);
  });

  private readonly sceneSize = computed<Size>(() => ({
    width: this.graffiti.sceneWidth(),
    height: this.graffiti.sceneHeight(),
  }));

  public ngAfterViewInit(): void {
    setTimeout(() => this.centerViewport(), 60);
    this.installMobileTouchHandlers();
    this.destroyRef.onDestroy(() => {
      this.viewportCtrl.stopInertia();
      if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
    });
  }

  public ngOnDestroy(): void {
    this.viewportCtrl.stopInertia();
    if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
  }

  public centerViewport(): void {
    if (!this.viewportRef) return;
    this.viewportCtrl.fitAndCenter({
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  public contentTransform(): string {
    return this.viewportCtrl.contentTransform();
  }

  // ─── Tap hit-test ──────────────────────────────────────────────

  private onTap(clientPoint: Point): void {
    if (!this.viewportRef) return;

    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const viewportPoint: Point = {
      x: clientPoint.x - rect.left,
      y: clientPoint.y - rect.top,
    };

    // Convert viewport pixel → content (logical) coordinate
    const contentPoint = this.viewportCtrl.viewportToContentPoint({ viewportPoint });

    // Find the closest house whose bounding box contains the tap
    const houses = this.graffiti.houses();
    let tappedHouse: TeamGraffitiHouse | null = null;

    for (const house of houses) {
      // House anchor is bottom-center, so bounding box is:
      //   left: house.x - HOUSE_WIDTH/2, right: house.x + HOUSE_WIDTH/2
      //   top:  house.y - HOUSE_HEIGHT,  bottom: house.y
      const left = house.x - HOUSE_WIDTH / 2;
      const right = house.x + HOUSE_WIDTH / 2;
      const top = house.y - HOUSE_HEIGHT;
      const bottom = house.y;

      if (contentPoint.x >= left && contentPoint.x <= right &&
          contentPoint.y >= top && contentPoint.y <= bottom) {
        tappedHouse = house;
        break;
      }
    }

    if (tappedHouse) {
      this.graffiti.tapHouse(tappedHouse);
    }
  }

  // ─── Pointer/wheel events ─────────────────────────────────────

  public onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.viewportCtrl.stopInertia();
    this.viewportRef.nativeElement.setPointerCapture(e.pointerId);
    this.gesture.onPointerDown(e);
  }

  public onPointerMove(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.gesture.onPointerMove(e);
  }

  public onPointerUp(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.gesture.onPointerUp(e);
  }

  public onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.viewportCtrl.stopInertia();

    if (e.ctrlKey || e.metaKey) {
      this.gesture.onWheel(e);
      return;
    }

    this.viewportCtrl.panBy({
      deltaX: -(e.deltaX || 0),
      deltaY: -(e.deltaY || 0),
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  // ─── Gesture callbacks ────────────────────────────────────────

  private onPan(delta: Point): void {
    this.viewportCtrl.panBy({
      deltaX: delta.x,
      deltaY: delta.y,
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  private onPanEnd(velocity: Point): void {
    this.viewportCtrl.setPanVelocityPxPerMs(velocity);
    this.viewportCtrl.startInertia({
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  private onPinch(center: Point, factor: number, centerDelta: Point): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vs: Size = { width: rect.width, height: rect.height };

    this.viewportCtrl.panBy({
      deltaX: centerDelta.x,
      deltaY: centerDelta.y,
      viewportSize: vs,
      sceneSize: this.sceneSize(),
    });

    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: center.x - rect.left, y: center.y - rect.top },
      factor,
      viewportSize: vs,
      sceneSize: this.sceneSize(),
    });
  }

  private onWheelZoom(clientPoint: Point, factor: number): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top },
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize(),
    });
  }

  // ─── Mobile touch handlers ────────────────────────────────────

  private installMobileTouchHandlers(): void {
    const el = this.viewportRef?.nativeElement;
    if (!el) return;

    const toFakePointerEvent = (t: Touch) =>
      ({
        pointerId: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY,
      }) as unknown as PointerEvent;

    const down = (ev: TouchEvent) => {
      this.viewportCtrl.stopInertia();
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerDown(toFakePointerEvent(t));
      }
    };

    const move = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerMove(toFakePointerEvent(t));
      }
    };

    const up = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerUp(toFakePointerEvent(t));
      }
    };

    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });

    this.removeMobileTouchHandlers = () => {
      el.removeEventListener("touchstart", down as EventListener);
      el.removeEventListener("touchmove", move as EventListener);
      el.removeEventListener("touchend", up as EventListener);
      el.removeEventListener("touchcancel", up as EventListener);
    };
  }

  private getViewportSize(): Size {
    if (!this.viewportRef) return { width: 400, height: 400 };
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}

