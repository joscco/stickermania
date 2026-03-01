import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import { OBJECT_TYPES, type ObjectType, type StickerPlacement } from "@birthday/shared";
import { ApiService } from "../../core/api.service";
import { WorldStore } from "../../core/world.store";
import * as QRCode from "qrcode";

import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { AdminOverlayComponent } from "./admin/admin.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
    EventToastsComponent,
    AdminOverlayComponent,
    BoardSetupDrawerComponent
  ],
  templateUrl: "./board.component.html"
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);

  public readonly showAdminOverlay = signal<boolean>(false);
  public readonly adminErrorText = signal<string | null>(null);
  private adminKey: string | null = null;

  public readonly events = signal<UiEvent[]>([]);
  public readonly wifiQrDataUrl = signal<string | null>(null);

  public readonly showSetupDrawer = signal<boolean>(false);

  private pollingTimerHandle: number | null = null;

  public constructor(private readonly apiService: ApiService, worldStore: WorldStore) {
    this.store = worldStore;
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

    // initial load + polling
    this.pollOnce();
    this.pollingTimerHandle = window.setInterval(() => this.pollOnce(), 700);
  }

  public ngOnDestroy(): void {
    if (this.pollingTimerHandle !== null) {
      window.clearInterval(this.pollingTimerHandle);
      this.pollingTimerHandle = null;
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

  // ---------- Rendering helpers ----------
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

  // ---------- UI events (local only, optional) ----------
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
}
