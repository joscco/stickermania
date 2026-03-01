import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed } from "@angular/core";
import { OBJECT_TYPES, type ObjectType, type StickerPlacement } from "@birthday/shared";
import { ApiService } from "../../core/api.service";
import { WorldStore } from "../../core/world.store";
import type { Point, Size } from "./types";
import { GestureInterpreter } from "./gesture-interpreter";
import { ViewportController } from "./viewport-controller";
import { StickerHandStore } from "./sticker-hand.store";

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly sceneWidthPx: number = 1000;
  public readonly sceneHeightPx: number = 700;

  public readonly viewportController = new ViewportController({ minScale: 0.6, maxScale: 2.8 });
  public readonly handStore: StickerHandStore;

  @ViewChild("viewport", { static: true })
  private viewportRef!: ElementRef<HTMLElement>;

  private pollingTimerHandle: number | null = null;
  private readonly gesture: GestureInterpreter;

  public readonly placementsSorted = computed((): StickerPlacement[] => {
    const world = this.store.world();
    if (!world) {
      return [];
    }
    return Object.values(world.placements).sort((a, b) => a.zIndex - b.zIndex);
  });

  public constructor(
    private readonly apiService: ApiService,
    worldStore: WorldStore,
    handStore: StickerHandStore
  ) {
    this.store = worldStore;
    this.handStore = handStore;

    this.gesture = new GestureInterpreter({
      callbacks: {
        onPan: (delta, velocity) => this.onPan(delta, velocity),
        onPanEnd: (velocity) => this.onPanEnd(velocity),
        onPinch: (centerClient, factor, centerDeltaClient) => this.onPinch(centerClient, factor, centerDeltaClient),
        onTap: (clientPoint) => this.onTap(clientPoint),
        onWheelZoom: (clientPoint, factor) => this.onWheelZoom(clientPoint, factor)
      },
      tapMaxDurationMs: 260,
      tapMoveThresholdPx: 14
    });
  }

  public ngOnInit(): void {
    this.store.setConnecting();
    this.handStore.ensureInitialized();

    this.pollOnce();
    this.pollingTimerHandle = window.setInterval(() => this.pollOnce(), 1200);

    window.setTimeout(() => this.centerViewport(), 0);
  }

  public ngOnDestroy(): void {
    if (this.pollingTimerHandle !== null) {
      window.clearInterval(this.pollingTimerHandle);
      this.pollingTimerHandle = null;
    }
    this.viewportController.stopInertia();
  }

  // ---------- Polling ----------
  private async pollOnce(): Promise<void> {
    try {
      const currentRevision: number | null = this.store.revision();
      const state = await this.apiService.getState({ sinceRevision: currentRevision });

      if (state) {
        this.store.setWorld(state);
        this.store.setConnected();
      } else {
        if (this.store.connectionStatus() !== "connected") {
          this.store.setConnected();
        }
      }
    } catch {
      this.store.setDisconnected();
      this.store.setError("Polling error");
    }
  }

  public async resetWorld(): Promise<void> {
    await this.apiService.reset();
    await this.pollOnce();
  }

  // ---------- UI (hand) ----------
  public selectHandIndex(index: number): void {
    // optional: allow explicit selection
    this.handStore.selectIndex(index);
  }

  public reshuffleHand(): void {
    this.handStore.reshuffle();
  }

  public emojiForType(objectType: ObjectType): string {
    const found = OBJECT_TYPES.find((t) => t.type === objectType);
    return found?.emoji ?? "❓";
  }

  // ---------- Viewport UI ----------
  public contentTransform(): string {
    return this.viewportController.contentTransform();
  }

  public zoomIn(): void {
    this.zoomAtViewportCenter(1.12);
  }

  public zoomOut(): void {
    this.zoomAtViewportCenter(0.88);
  }

  public centerViewport(): void {
    const viewportSize = this.getViewportSize();
    this.viewportController.center({ viewportSize, sceneSize: this.sceneSize() });
  }

  private zoomAtViewportCenter(factor: number): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();

    this.viewportController.zoomAtPoint({
      viewportPoint: { x: rect.width / 2, y: rect.height / 2 },
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize()
    });
  }

  private sceneSize(): Size {
    return { width: this.sceneWidthPx, height: this.sceneHeightPx };
  }

  private getViewportSize(): Size {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  // ---------- Gesture bindings ----------
  public onViewportPointerDown(event: PointerEvent): void {
    this.viewportController.stopInertia();
    this.viewportRef.nativeElement.setPointerCapture(event.pointerId);
    this.gesture.onPointerDown(event);
  }

  public onViewportPointerMove(event: PointerEvent): void {
    this.gesture.onPointerMove(event);
  }

  public onViewportPointerUp(event: PointerEvent): void {
    this.gesture.onPointerUp(event);
  }

  public onViewportWheel(event: WheelEvent): void {
    event.preventDefault();
    this.viewportController.stopInertia();
    this.gesture.onWheel(event);
  }

  private onPan(delta: Point, velocityPxPerMs: Point): void {
    const viewportSize = this.getViewportSize();

    this.viewportController.panBy({
      deltaX: delta.x,
      deltaY: delta.y,
      viewportSize,
      sceneSize: this.sceneSize()
    });

    this.viewportController.setPanVelocityPxPerMs(velocityPxPerMs);
  }

  private onPanEnd(velocityPxPerMs: Point): void {
    this.viewportController.setPanVelocityPxPerMs(velocityPxPerMs);
    const viewportSize = this.getViewportSize();
    this.viewportController.startInertia({ viewportSize, sceneSize: this.sceneSize() });
  }

  private onPinch(centerClient: Point, factor: number, centerDeltaClient: Point): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();

    const viewportSize = { width: rect.width, height: rect.height };

    // 2-finger pan: center movement
    this.viewportController.panBy({
      deltaX: centerDeltaClient.x,
      deltaY: centerDeltaClient.y,
      viewportSize,
      sceneSize: this.sceneSize()
    });

    // 2-finger zoom around center
    const viewportPoint: Point = { x: centerClient.x - rect.left, y: centerClient.y - rect.top };

    this.viewportController.zoomAtPoint({
      viewportPoint,
      factor,
      viewportSize,
      sceneSize: this.sceneSize()
    });
  }

  private onWheelZoom(clientPoint: Point, factor: number): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();

    const viewportPoint: Point = { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top };

    this.viewportController.zoomAtPoint({
      viewportPoint,
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize()
    });
  }

  private onTap(clientPoint: Point): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();

    const viewportPoint: Point = { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top };
    const contentPoint = this.viewportController.viewportToContentPoint({ viewportPoint });

    const normalizedX = contentPoint.x / this.sceneWidthPx;
    const normalizedY = contentPoint.y / this.sceneHeightPx;

    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      return;
    }

    const activeSlot = this.handStore.getActiveSlot();

    // consume now so UI feels instant; if request fails, we could redraw back later.
    this.handStore.consumeActiveSlotAndRedraw();

    this.apiService.place({
      x: normalizedX,
      y: normalizedY,
      objectType: activeSlot.type,
      rotationDeg: 0,
      scale: 1
    }).then(() => this.pollOnce());
  }
}
