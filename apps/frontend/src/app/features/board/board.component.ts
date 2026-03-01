import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from "@angular/core";
import type { ObjectType, StickerPlacement } from "@birthday/shared";
import { OBJECT_TYPES } from "@birthday/shared";
import { ApiService } from "../../core/api.service";
import { WorldStore } from "../../core/world.store";
import { ChallengeStore } from "../../core/challenge.store";
import * as QRCode from "qrcode";

import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { AdminOverlayComponent } from "./admin/admin.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";
import { SceneRendererComponent } from "../../shared/scene-renderer/scene-renderer.component";

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
    EventToastsComponent,
    AdminOverlayComponent,
    BoardSetupDrawerComponent,
    SceneRendererComponent
  ],
  templateUrl: "./board.component.html"
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly challengeStore: ChallengeStore;

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);

  public readonly showAdminOverlay = signal<boolean>(false);
  public readonly adminErrorText = signal<string | null>(null);
  private adminKey: string | null = null;

  public readonly events = signal<UiEvent[]>([]);
  public readonly wifiQrDataUrl = signal<string | null>(null);

  public readonly showSetupDrawer = signal<boolean>(false);

  private pollingTimerHandle: number | null = null;
  private challengePollingTimerHandle: number | null = null;

  // --- autoscale for renderer ---
  @ViewChild("sceneHost", { static: true })
  private sceneHostRef!: ElementRef<HTMLElement>;

  public readonly boardScale = signal<number>(1);
  private resizeObserver: ResizeObserver | null = null;

  private readonly sceneWidthPx: number = 1000;
  private readonly sceneHeightPx: number = 700;

  // --- Challenge UI ---
  public readonly challengeText = signal<string>("Melone als Hut!");
  public readonly challengeDurationSec = signal<number>(120);
  public readonly isStartingChallenge = signal<boolean>(false);
  public readonly lastChallengeError = signal<string | null>(null);

  public constructor(
    private readonly apiService: ApiService,
    worldStore: WorldStore,
    challengeStore: ChallengeStore
  ) {
    this.store = worldStore;
    this.challengeStore = challengeStore;
  }

  public onWifiQrGenerated(dataUrl: string): void {
    const trimmed: string = (dataUrl ?? "").trim();
    this.wifiQrDataUrl.set(trimmed.length > 0 ? trimmed : null);
  }

  public async ngOnInit(): Promise<void> {
    this.store.setConnecting();

    // Player URL/QR: force http to avoid iOS HTTPS warnings
    const host: string = window.location.host;
    const playerUrl: string = `http://${host}/#/player`;
    this.playerUrl.set(playerUrl);
    this.playerQrDataUrl.set(await QRCode.toDataURL(playerUrl, { margin: 1, scale: 6 }));

    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay.set(!this.adminKey);

    this.setupAutoScale();

    // initial load + polling
    this.pollOnce();
    this.pollingTimerHandle = window.setInterval(() => this.pollOnce(), 700);

    this.pollChallengeOnce();
    this.challengePollingTimerHandle = window.setInterval(() => this.pollChallengeOnce(), 700);
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  public toggleSetupDrawer(): void {
    this.showSetupDrawer.set(!this.showSetupDrawer());
  }

  public onSetupDrawerCloseRequested(): void {
    this.showSetupDrawer.set(false);
  }

  public async resetWorld(): Promise<void> {
    await this.apiService.reset();
    await this.pollOnce();
    this.pushEvent("World reset", Date.now());
  }

  public canReset(): boolean {
    return (this.adminKey ?? "").trim().length > 0;
  }

  public onAdminKeySubmitted(adminKey: string): void {
    this.adminKey = adminKey;
    localStorage.setItem("birthday_admin_key", adminKey);
    this.adminErrorText.set(null);
    this.showAdminOverlay.set(false);
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
      // ignore in party mode
    }
  }

  // ---------- Challenge actions ----------
  public async startChallenge(): Promise<void> {
    this.lastChallengeError.set(null);

    const text = this.challengeText().trim();
    if (text.length <= 0) {
      this.lastChallengeError.set("Bitte Challenge-Text eingeben.");
      return;
    }

    const durationSec = this.challengeDurationSec();
    const durationMs = Math.max(10, Number.isFinite(durationSec) ? durationSec : 120) * 1000;

    try {
      this.isStartingChallenge.set(true);
      await this.apiService.startChallenge({ text, durationMs });
      await this.pollChallengeOnce();
      this.pushEvent("Challenge gestartet", Date.now());
    } catch {
      this.lastChallengeError.set("Konnte Challenge nicht starten.");
    } finally {
      this.isStartingChallenge.set(false);
    }
  }

  public timeLeftLabel(endsAt: number): string {
    const msLeft = Math.max(0, endsAt - Date.now());
    const sec = Math.floor(msLeft / 1000);
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // ---------- autoscale ----------
  private setupAutoScale(): void {
    const hostElement = this.sceneHostRef.nativeElement;

    const recompute = () => {
      const hostRect = hostElement.getBoundingClientRect();
      const scaleByWidth = hostRect.width / this.sceneWidthPx;
      const clampedScale = Math.min(2.5, Math.max(0.4, scaleByWidth));
      this.boardScale.set(clampedScale);
    };

    this.resizeObserver = new ResizeObserver(() => recompute());
    this.resizeObserver.observe(hostElement);

    recompute();
  }

  // ---------- Rendering helpers (still used) ----------
  public placementsSorted(): StickerPlacement[] {
    const world = this.store.world();
    if (!world) {
      return [];
    }
    return Object.values(world.placements).sort((a, b) => a.zIndex - b.zIndex);
  }

  public emojiForType(objectType: ObjectType): string {
    const found = OBJECT_TYPES.find((t) => t.type === objectType);
    return found?.emoji ?? "❓";
  }

  // ---------- UI events ----------
  private pushEvent(text: string, createdAt: number): void {
    const id: string = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const next: UiEvent = { id, text, createdAt };

    this.events.set([next, ...this.events()]);

    window.setTimeout(() => {
      this.events.set(this.events().filter((e) => e.id !== id));
    }, 3500);
  }

  private loadAdminKey(): string | null {
    const stored: string | null = localStorage.getItem("birthday_admin_key");
    if (!stored) {
      return null;
    }
    const trimmed: string = stored.trim();
    if (trimmed.length <= 0) {
      return null;
    }
    return trimmed;
  }

  protected readonly Number = Number;
}
