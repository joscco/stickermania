import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from "@angular/core";
import { OBJECT_TYPES, toCellKey, type ObjectType } from "@birthday/shared";
import { environment } from "../../../environments/environment";
import { WsService } from "../../core/ws.service";
import { WorldStore } from "../../core/world.store";

type Point = { x: number; y: number };

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;

  public readonly objectTypes = OBJECT_TYPES;
  public readonly selectedType = signal<ObjectType>("tree");
  public readonly removeMode = signal<boolean>(false);

  @ViewChild("viewport", { static: true })
  private viewportRef!: ElementRef<HTMLElement>;

  public readonly scale = signal<number>(1.0);
  public readonly offsetX = signal<number>(0);
  public readonly offsetY = signal<number>(0);

  private activePointers: Map<number, Point> = new Map();
  private isPanning: boolean = false;

  // incremental pan + inertia
  private lastPanClient: Point | null = null;
  private lastPanTimestampMs: number = 0;
  private panVelocityPxPerMs: Point = { x: 0, y: 0 };
  private inertiaRafHandle: number | null = null;

  // pinch
  private pinchStartDistance: number | null = null;
  private pinchStartScale: number | null = null;
  private pinchAnchorContentPoint: Point | null = null;

  // tap detection
  private tapStartClient: Point | null = null;
  private tapMoved: boolean = false;
  private wasPinching: boolean = false;
  private readonly tapMoveThresholdPx: number = 8;

  // IMPORTANT: center only once (otherwise state updates "snap back")
  private didInitialCenter: boolean = false;
  private lastWorldSizeKey: string | null = null;

  // Must match HTML sizing:
  private readonly cellSizePx: number = 40; // w-10/h-10
  private readonly gapPx: number = 4; // gap-1
  private readonly paddingPx: number = 12; // p-3

  public constructor(private readonly wsService: WsService, worldStore: WorldStore) {
    this.store = worldStore;
  }

  public ngOnInit(): void {
    this.store.setConnecting();

    const websocketUrl: string =
      environment.websocketUrl && environment.websocketUrl.length > 0
        ? environment.websocketUrl
        : this.buildDefaultWebsocketUrl();

    this.wsService.connect({
      websocketUrl,
      onOpen: () => {
        this.store.setConnected();
        this.wsService.send({ type: "join", kind: "player" });
      },
      onClose: () => this.store.setDisconnected(),
      onError: () => {
        this.store.setDisconnected();
        this.store.setError("WebSocket error");
      },
      onMessage: (message) => {
        this.store.handleServerMessage(message);

        // Center only on first world or if grid size changes
        if (message.type === "state") {
          const sizeKey: string = `${message.state.width}x${message.state.height}`;
          if (!this.didInitialCenter || this.lastWorldSizeKey !== sizeKey) {
            this.didInitialCenter = true;
            this.lastWorldSizeKey = sizeKey;
            window.setTimeout(() => this.centerViewport(), 0);
          }
        }
      }
    });
  }

  public ngOnDestroy(): void {
    this.wsService.disconnect();
    this.stopInertia();
  }

  // ---------- UI ----------
  public select(type: ObjectType): void {
    this.selectedType.set(type);
  }

  public toggleRemoveMode(): void {
    this.removeMode.set(!this.removeMode());
  }

  public resetWorld(): void {
    this.wsService.send({ type: "reset" });
  }

  public onCellAction(x: number, y: number): void {
    if (this.removeMode()) {
      this.wsService.send({ type: "remove", x, y });
      return;
    }
    this.wsService.send({ type: "place", x, y, objectType: this.selectedType() });
  }

  // ---------- Viewport transform ----------
  public contentTransform(): string {
    return `translate(${this.offsetX()}px, ${this.offsetY()}px) scale(${this.scale()})`;
  }

  public zoomIn(): void {
    this.zoomAtViewportCenter(1.12);
  }

  public zoomOut(): void {
    this.zoomAtViewportCenter(0.88);
  }

  public centerViewport(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const world = this.store.world();
    const width = world?.width ?? 30;
    const height = world?.height ?? 20;

    const contentSize = this.getContentSizePx(width, height);
    const scale = this.scale();

    const centeredX = (viewportRect.width - contentSize.width * scale) / 2;
    const centeredY = (viewportRect.height - contentSize.height * scale) / 2;

    const clamped = this.clampOffsets({ offsetX: centeredX, offsetY: centeredY, scale });
    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);
  }

  private zoomAtViewportCenter(factor: number): void {
    const viewport = this.viewportRef.nativeElement;
    const rect = viewport.getBoundingClientRect();
    this.zoomAtPoint({
      viewportPoint: { x: rect.width / 2, y: rect.height / 2 },
      factor
    });
  }

  private zoomAtPoint(args: { viewportPoint: Point; factor: number }): void {
    const previousScale = this.scale();
    const nextScale = this.clampScale(previousScale * args.factor);

    const contentPoint = this.viewportToContentPoint(args.viewportPoint, previousScale);

    const nextOffsetX = args.viewportPoint.x - contentPoint.x * nextScale;
    const nextOffsetY = args.viewportPoint.y - contentPoint.y * nextScale;

    const clamped = this.clampOffsets({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: nextScale });
    this.scale.set(nextScale);
    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);
  }

  private viewportToContentPoint(viewportPoint: Point, currentScale: number): Point {
    return {
      x: (viewportPoint.x - this.offsetX()) / currentScale,
      y: (viewportPoint.y - this.offsetY()) / currentScale
    };
  }

  private clampScale(scale: number): number {
    const minScale = 0.6;
    const maxScale = 2.8;
    return Math.min(maxScale, Math.max(minScale, scale));
  }

  private clampOffsets(args: { offsetX: number; offsetY: number; scale: number }): { offsetX: number; offsetY: number } {
    const viewport = this.viewportRef.nativeElement;
    const viewportRect = viewport.getBoundingClientRect();

    const world = this.store.world();
    const width = world?.width ?? 30;
    const height = world?.height ?? 20;

    const contentSize = this.getContentSizePx(width, height);
    const scaledWidth = contentSize.width * args.scale;
    const scaledHeight = contentSize.height * args.scale;

    // If content smaller than viewport: keep it centered (prevents clamp-snaps)
    let offsetX: number;
    if (scaledWidth <= viewportRect.width) {
      offsetX = (viewportRect.width - scaledWidth) / 2;
    } else {
      const minX = viewportRect.width - scaledWidth; // negative
      const maxX = 0;
      offsetX = this.clampNumber(args.offsetX, minX, maxX);
    }

    let offsetY: number;
    if (scaledHeight <= viewportRect.height) {
      offsetY = (viewportRect.height - scaledHeight) / 2;
    } else {
      const minY = viewportRect.height - scaledHeight; // negative
      const maxY = 0;
      offsetY = this.clampNumber(args.offsetY, minY, maxY);
    }

    return { offsetX, offsetY };
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  private getContentSizePx(width: number, height: number): { width: number; height: number } {
    const cell = this.cellSizePx;
    const gap = this.gapPx;
    const padding = this.paddingPx;

    const contentWidth = padding * 2 + width * cell + Math.max(0, width - 1) * gap;
    const contentHeight = padding * 2 + height * cell + Math.max(0, height - 1) * gap;

    return { width: contentWidth, height: contentHeight };
  }

  // ---------- Inertia ----------
  private stopInertia(): void {
    if (this.inertiaRafHandle === null) {
      return;
    }
    window.cancelAnimationFrame(this.inertiaRafHandle);
    this.inertiaRafHandle = null;
  }

  private startInertia(): void {
    const speed = Math.hypot(this.panVelocityPxPerMs.x, this.panVelocityPxPerMs.y);
    if (speed < 0.02) {
      return;
    }

    const decayPerFrame = 0.90;
    let lastT = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(32, Math.max(8, t - lastT));
      lastT = t;

      const nextOffsetX = this.offsetX() + this.panVelocityPxPerMs.x * dt;
      const nextOffsetY = this.offsetY() + this.panVelocityPxPerMs.y * dt;

      const clamped = this.clampOffsets({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: this.scale() });
      this.offsetX.set(clamped.offsetX);
      this.offsetY.set(clamped.offsetY);

      const hitEdgeX = clamped.offsetX !== nextOffsetX;
      const hitEdgeY = clamped.offsetY !== nextOffsetY;
      const edgeDamp = (hitEdgeX || hitEdgeY) ? 0.65 : 1.0;

      this.panVelocityPxPerMs = {
        x: this.panVelocityPxPerMs.x * decayPerFrame * edgeDamp,
        y: this.panVelocityPxPerMs.y * decayPerFrame * edgeDamp
      };

      const newSpeed = Math.hypot(this.panVelocityPxPerMs.x, this.panVelocityPxPerMs.y);
      if (newSpeed < 0.01) {
        this.inertiaRafHandle = null;
        return;
      }

      this.inertiaRafHandle = window.requestAnimationFrame(tick);
    };

    this.inertiaRafHandle = window.requestAnimationFrame(tick);
  }

  // ---------- Pointer + wheel ----------
  public onViewportPointerDown(event: PointerEvent): void {
    this.stopInertia();

    const viewport = this.viewportRef.nativeElement;
    viewport.setPointerCapture(event.pointerId);

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      this.isPanning = true;
      this.lastPanClient = { x: event.clientX, y: event.clientY };
      this.lastPanTimestampMs = performance.now();
      this.panVelocityPxPerMs = { x: 0, y: 0 };

      this.pinchStartDistance = null;
      this.pinchStartScale = null;
      this.pinchAnchorContentPoint = null;

      this.tapStartClient = { x: event.clientX, y: event.clientY };
      this.tapMoved = false;
      this.wasPinching = false;
      return;
    }

    if (this.activePointers.size === 2) {
      const [p1, p2] = Array.from(this.activePointers.values());

      this.pinchStartDistance = this.distance(p1, p2);
      this.pinchStartScale = this.scale();

      const viewportRect = viewport.getBoundingClientRect();
      const midViewport: Point = {
        x: ((p1.x + p2.x) / 2) - viewportRect.left,
        y: ((p1.y + p2.y) / 2) - viewportRect.top
      };

      this.pinchAnchorContentPoint = this.viewportToContentPoint(midViewport, this.scale());

      this.isPanning = false;
      this.wasPinching = true;
      this.tapStartClient = null;
      this.tapMoved = true;
    }
  }

  public onViewportPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.tapStartClient) {
      const dx = event.clientX - this.tapStartClient.x;
      const dy = event.clientY - this.tapStartClient.y;
      if (Math.hypot(dx, dy) > this.tapMoveThresholdPx) {
        this.tapMoved = true;
      }
    }

    const viewport = this.viewportRef.nativeElement;
    const viewportRect = viewport.getBoundingClientRect();

    // Pinch zoom
    if (this.activePointers.size === 2 && this.pinchStartDistance && this.pinchStartScale && this.pinchAnchorContentPoint) {
      const [p1, p2] = Array.from(this.activePointers.values());
      const newDistance = this.distance(p1, p2);

      const factor = newDistance / this.pinchStartDistance;
      const nextScale = this.clampScale(this.pinchStartScale * factor);

      const midViewport: Point = {
        x: ((p1.x + p2.x) / 2) - viewportRect.left,
        y: ((p1.y + p2.y) / 2) - viewportRect.top
      };

      const nextOffsetX = midViewport.x - this.pinchAnchorContentPoint.x * nextScale;
      const nextOffsetY = midViewport.y - this.pinchAnchorContentPoint.y * nextScale;

      const clamped = this.clampOffsets({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: nextScale });
      this.scale.set(nextScale);
      this.offsetX.set(clamped.offsetX);
      this.offsetY.set(clamped.offsetY);

      this.panVelocityPxPerMs = { x: 0, y: 0 };
      return;
    }

    // Incremental pan
    if (!this.isPanning || !this.lastPanClient) {
      return;
    }

    const nowT = performance.now();
    const dt = Math.max(8, nowT - this.lastPanTimestampMs);

    const dx = event.clientX - this.lastPanClient.x;
    const dy = event.clientY - this.lastPanClient.y;

    this.lastPanClient = { x: event.clientX, y: event.clientY };
    this.lastPanTimestampMs = nowT;

    const nextOffsetX = this.offsetX() + dx;
    const nextOffsetY = this.offsetY() + dy;

    const clamped = this.clampOffsets({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: this.scale() });
    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);

    const vx = dx / dt;
    const vy = dy / dt;
    const alpha = 0.25;
    this.panVelocityPxPerMs = {
      x: this.panVelocityPxPerMs.x * (1 - alpha) + vx * alpha,
      y: this.panVelocityPxPerMs.y * (1 - alpha) + vy * alpha
    };
  }

  public onViewportPointerUp(event: PointerEvent): void {
    const wasActive = this.activePointers.has(event.pointerId);
    this.activePointers.delete(event.pointerId);

    const isTap =
      wasActive &&
      !this.wasPinching &&
      !this.tapMoved &&
      this.activePointers.size === 0;

    if (isTap) {
      this.handleTapAtClientPoint({ x: event.clientX, y: event.clientY });
    }

    if (this.activePointers.size === 0) {
      this.isPanning = false;
      this.lastPanClient = null;

      this.pinchStartDistance = null;
      this.pinchStartScale = null;
      this.pinchAnchorContentPoint = null;

      const endedAfterPinch = this.wasPinching;

      this.tapStartClient = null;
      this.tapMoved = false;
      this.wasPinching = false;

      // Inertia feels weird right after pinch -> only if it wasn't pinch
      if (!endedAfterPinch) {
        this.startInertia();
      }
      return;
    }

    if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];

      this.isPanning = true;
      this.lastPanClient = { x: remaining.x, y: remaining.y };
      this.lastPanTimestampMs = performance.now();
      this.panVelocityPxPerMs = { x: 0, y: 0 };

      this.pinchStartDistance = null;
      this.pinchStartScale = null;
      this.pinchAnchorContentPoint = null;

      this.wasPinching = false;

      this.tapStartClient = { x: remaining.x, y: remaining.y };
      this.tapMoved = false;
    }
  }

  public onViewportWheel(event: WheelEvent): void {
    event.preventDefault();
    this.stopInertia();

    const viewport = this.viewportRef.nativeElement;
    const rect = viewport.getBoundingClientRect();

    const viewportPoint: Point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    this.zoomAtPoint({ viewportPoint, factor });
  }

  private handleTapAtClientPoint(clientPoint: Point): void {
    const viewport = this.viewportRef.nativeElement;
    const rect = viewport.getBoundingClientRect();

    const viewportPoint: Point = {
      x: clientPoint.x - rect.left,
      y: clientPoint.y - rect.top
    };

    const contentPoint: Point = this.viewportToContentPoint(viewportPoint, this.scale());
    const cell = this.contentPointToCell(contentPoint);

    if (!cell) {
      return;
    }

    this.onCellAction(cell.x, cell.y);
  }

  private contentPointToCell(contentPoint: Point): { x: number; y: number } | null {
    const world = this.store.world();
    if (!world) {
      return null;
    }

    const xInGrid = contentPoint.x - this.paddingPx;
    const yInGrid = contentPoint.y - this.paddingPx;

    if (xInGrid < 0 || yInGrid < 0) {
      return null;
    }

    const pitch = this.cellSizePx + this.gapPx;

    const xIndex = Math.floor(xInGrid / pitch);
    const yIndex = Math.floor(yInGrid / pitch);

    if (xIndex < 0 || yIndex < 0 || xIndex >= world.width || yIndex >= world.height) {
      return null;
    }

    const xRemainder = xInGrid - xIndex * pitch;
    const yRemainder = yInGrid - yIndex * pitch;

    if (xRemainder > this.cellSizePx || yRemainder > this.cellSizePx) {
      return null;
    }

    return { x: xIndex, y: yIndex };
  }

  private distance(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------- Grid rendering ----------
  public gridTemplateColumns(): string {
    const world = this.store.world();
    const width: number = world?.width ?? 30;
    return `repeat(${width}, 2.5rem)`;
  }

  public cells(): Array<{ x: number; y: number; emoji: string }> {
    const world = this.store.world();
    if (!world) {
      return [];
    }

    const result: Array<{ x: number; y: number; emoji: string }> = [];

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = toCellKey(x, y);
        const placed = world.cells[key];
        const emoji: string = placed ? this.emojiForType(placed.type) : "";
        result.push({ x, y, emoji });
      }
    }

    return result;
  }

  private emojiForType(objectType: ObjectType): string {
    const found = OBJECT_TYPES.find((t) => t.type === objectType);
    return found?.emoji ?? "❓";
  }

  private buildDefaultWebsocketUrl(): string {
    const protocol: string = window.location.protocol === "https:" ? "wss" : "ws";
    const hostname: string = window.location.hostname;
    const backendPort: string = "3001";
    return `${protocol}://${hostname}:${backendPort}/ws`;
  }
}
