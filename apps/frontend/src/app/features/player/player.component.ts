import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed } from "@angular/core";
import { OBJECT_TYPES, type ObjectType, type StickerPlacement } from "@birthday/shared";
import { ApiService } from "../../core/api.service";
import { WorldStore } from "../../core/world.store";
import { ChallengeStore } from "../../core/challenge.store";
import type { Point, Size } from "./types";
import { GestureInterpreter } from "./gesture-interpreter";
import { ViewportController } from "./viewport-controller";
import { StickerHandStore } from "./sticker-hand.store";
import { SceneRendererComponent } from "../../shared/scene-renderer/scene-renderer.component";

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, SceneRendererComponent],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly challengeStore: ChallengeStore;

  public readonly objectTypes = OBJECT_TYPES;

  public readonly sceneWidthPx: number = 1000;
  public readonly sceneHeightPx: number = 700;

  public readonly viewportController = new ViewportController({ minScale: 0.6, maxScale: 2.8 });
  public readonly handStore: StickerHandStore;

  @ViewChild("viewport", { static: true })
  private viewportRef!: ElementRef<HTMLElement>;

  private pollingTimerHandle: number | null = null;
  private challengePollingTimerHandle: number | null = null;

  private readonly gesture: GestureInterpreter;

  private readonly voterId: string = this.loadOrCreateVoterId();

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
    challengeStore: ChallengeStore,
    handStore: StickerHandStore
  ) {
    this.store = worldStore;
    this.challengeStore = challengeStore;
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

  private renderWorldToPngDataUrl(args: { world: any; width: number; height: number }): string {
    const canvas = document.createElement("canvas");
    canvas.width = args.width;
    canvas.height = args.height;

    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }

    // optional background (transparent or a subtle dark)
    context.clearRect(0, 0, canvas.width, canvas.height);

    // draw placements (sorted by zIndex)
    const placements: any[] = Object.values(args.world?.placements ?? {});
    placements.sort((a, b) => (a?.zIndex ?? 0) - (b?.zIndex ?? 0));

    for (const placement of placements) {
      const normalizedX = Number(placement?.x);
      const normalizedY = Number(placement?.y);
      const rotationDeg = Number(placement?.rotationDeg ?? 0);
      const stickerScale = Number(placement?.scale ?? 1);
      const objectType = String(placement?.type ?? "");

      if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
        continue;
      }

      const emoji = this.emojiForType(objectType as any);

      const centerX = normalizedX * canvas.width;
      const centerY = normalizedY * canvas.height;

      const baseSizePx = 40;
      const fontSizePx = 28;

      context.save();
      context.translate(centerX, centerY);
      context.rotate((rotationDeg * Math.PI) / 180);
      context.scale(stickerScale, stickerScale);

      // simple “sticker tile”
      context.fillStyle = "rgba(0,0,0,0.25)";
      context.strokeStyle = "rgba(255,255,255,0.15)";
      context.lineWidth = 2;

      const half = baseSizePx / 2;
      // rounded rect (manual)
      const radius = 10;
      context.beginPath();
      context.moveTo(-half + radius, -half);
      context.lineTo(half - radius, -half);
      context.quadraticCurveTo(half, -half, half, -half + radius);
      context.lineTo(half, half - radius);
      context.quadraticCurveTo(half, half, half - radius, half);
      context.lineTo(-half + radius, half);
      context.quadraticCurveTo(-half, half, -half, half - radius);
      context.lineTo(-half, -half + radius);
      context.quadraticCurveTo(-half, -half, -half + radius, -half);
      context.closePath();
      context.fill();
      context.stroke();

      // emoji
      context.font = `${fontSizePx}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "white";
      context.fillText(emoji, 0, 2);

      context.restore();
    }

    return canvas.toDataURL("image/png");
  }

  public ngOnInit(): void {
    this.store.setConnecting();
    this.handStore.ensureInitialized();

    // world polling
    this.pollOnce();
    this.pollingTimerHandle = window.setInterval(() => this.pollOnce(), 1200);

    // challenge polling
    this.pollChallengeOnce();
    this.challengePollingTimerHandle = window.setInterval(() => this.pollChallengeOnce(), 900);

    window.setTimeout(() => this.centerViewport(), 0);
  }

  public ngOnDestroy(): void {
    if (this.pollingTimerHandle !== null) {
      window.clearInterval(this.pollingTimerHandle);
      this.pollingTimerHandle = null;
    }
    if (this.challengePollingTimerHandle !== null) {
      window.clearInterval(this.challengePollingTimerHandle);
      this.challengePollingTimerHandle = null;
    }
    this.viewportController.stopInertia();
  }

  // ---------- Polling (World) ----------
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

  // ---------- Polling (Challenge) ----------
  private async pollChallengeOnce(): Promise<void> {
    try {
      const currentRevision: number | null = this.challengeStore.revision();
      const state = await this.apiService.getChallengeState({ sinceRevision: currentRevision });
      if (state) {
        this.challengeStore.setState(state);
      }
    } catch {
      // party mode: ignore
    }
  }

  public async resetWorld(): Promise<void> {
    await this.apiService.reset();
    await this.pollOnce();
  }

  public async submitForVote(): Promise<void> {
    const world = this.store.world();
    if (!world) {
      return;
    }

    const screenshotDataUrl = this.renderWorldToPngDataUrl({ world, width: 1000, height: 700 });

    await this.apiService.submitSnapshot({
      voterId: this.voterId,
      screenshotDataUrl
    });

    await this.pollChallengeOnce();
  }

  public async castVote(vote: boolean): Promise<void> {
    const submission = this.challengeStore.activeSubmission();
    if (!submission || submission.status !== "OPEN") {
      return;
    }
    await this.apiService.vote({ submissionId: submission.id, voterId: this.voterId, vote });
    await this.pollChallengeOnce();
  }

  public voterIdShort(): string {
    return this.voterId.slice(-6);
  }

  // ---------- Hand UI ----------
  public selectHandIndex(index: number): void {
    this.handStore.selectIndex(index);
  }

  public reshuffleHand(): void {
    this.handStore.reshuffle();
  }

  public emojiForType(objectType: ObjectType): string {
    const found = OBJECT_TYPES.find((entry) => entry.type === objectType);
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

    // two-finger pan: center movement
    this.viewportController.panBy({
      deltaX: centerDeltaClient.x,
      deltaY: centerDeltaClient.y,
      viewportSize,
      sceneSize: this.sceneSize()
    });

    // zoom around pinch center
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
    this.handStore.consumeActiveSlotAndRedraw();

    this.apiService.place({
      x: normalizedX,
      y: normalizedY,
      objectType: activeSlot.type,
      rotationDeg: 0,
      scale: 1
    }).then(() => this.pollOnce());
  }

  private loadOrCreateVoterId(): string {
    const existing = localStorage.getItem("birthday_voter_id");
    if (existing && existing.trim().length > 0) {
      return existing;
    }

    const created = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("birthday_voter_id", created);
    return created;
  }
}
