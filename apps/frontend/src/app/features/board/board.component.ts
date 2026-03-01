import {CommonModule} from "@angular/common";
import {Component, OnDestroy, OnInit, signal} from "@angular/core";
import {OBJECT_TYPES, toCellKey, type ObjectType, type ServerToClientMessage} from "@birthday/shared";
import {environment} from "../../../environments/environment";
import {WsService} from "../../core/ws.service";
import {WorldStore} from "../../core/world.store";
import * as QRCode from "qrcode";

import {EventToastsComponent, type UiEvent} from "./events/event-toasts.component";
import {AdminOverlayComponent} from "./admin/admin.component";
import {BoardSetupDrawerComponent} from './setup/board-setup-drawer.component';

interface GridCellVm {
  x: number;
  y: number;
  emoji: string;
}

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
    EventToastsComponent,
    AdminOverlayComponent,
    BoardSetupDrawerComponent,
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

  public constructor(private readonly wsService: WsService, worldStore: WorldStore) {
    this.store = worldStore;
  }

  public onWifiQrGenerated(dataUrl: string): void {
    const trimmed: string = (dataUrl ?? "").trim();
    this.wifiQrDataUrl.set(trimmed.length > 0 ? trimmed : null);
  }

  public async ngOnInit(): Promise<void> {
    this.store.setConnecting();

    // Player URL/QR: force http to avoid iOS HTTPS warnings
    const host: string = window.location.host; // e.g. game:3001
    const playerUrl: string = `http://${host}/#/player`;
    this.playerUrl.set(playerUrl);
    this.playerQrDataUrl.set(await QRCode.toDataURL(playerUrl, {margin: 1, scale: 6}));

    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay.set(!this.adminKey);

    const websocketUrl: string =
      environment.websocketUrl && environment.websocketUrl.length > 0
        ? environment.websocketUrl
        : this.buildDefaultWebsocketUrl();

    this.wsService.connect({
      websocketUrl,
      onOpen: () => {
        this.store.setConnected();
        this.sendJoin();
      },
      onClose: () => this.store.setDisconnected(),
      onError: () => {
        this.store.setDisconnected();
        this.store.setError("WebSocket error");
      },
      onMessage: (message) => this.onServerMessage(message)
    });
  }

  public ngOnDestroy(): void {
    this.wsService.disconnect();
  }

  public toggleSetupDrawer(): void {
    this.showSetupDrawer.set(!this.showSetupDrawer());
  }

  public onSetupDrawerCloseRequested(): void {
    console.log("onSetupDrawerCloseRequested");
    this.showSetupDrawer.set(false);
  }

  public resetWorld(): void {
    this.wsService.send({type: "reset"});
  }

  public canReset(): boolean {
    return (this.adminKey ?? "").trim().length > 0;
  }

  public onAdminKeySubmitted(adminKey: string): void {
    this.adminKey = adminKey;
    localStorage.setItem("birthday_admin_key", adminKey);
    this.adminErrorText.set(null);
    this.showAdminOverlay.set(false);

    // Re-send join so backend marks this connection as admin
    this.sendJoin();
  }

  private sendJoin(): void {
    this.wsService.send({
      type: "join",
      kind: "board",
      adminKey: this.adminKey ?? undefined
    });
  }


  private onServerMessage(message: ServerToClientMessage): void {
    this.store.handleServerMessage(message);

    if (message.type === "event") {
      this.pushEvent(message.text, message.createdAt);
      return;
    }

    if (message.type === "error") {
      if (String(message.message).includes("admin")) {
        this.adminErrorText.set(message.message);
      }
      return;
    }
  }

  private pushEvent(text: string, createdAt: number): void {
    const id: string = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const next: UiEvent = {id, text, createdAt};

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
    return trimmed.length > 0 ? trimmed : null;
  }

  public gridTemplateColumns(): string {
    const world = this.store.world();
    const width: number = world?.width ?? 30;
    return `repeat(${width}, 2.75rem)`; // w-11
  }

  public cellKey(cell: GridCellVm): string {
    return `${cell.x},${cell.y}`;
  }

  public cells(): GridCellVm[] {
    const world = this.store.world();
    if (!world) {
      return [];
    }

    const result: GridCellVm[] = [];

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = toCellKey(x, y);
        const placed = world.cells[key];
        const emoji: string = placed ? this.emojiForType(placed.type) : "";
        result.push({x, y, emoji});
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
    return `${protocol}://${window.location.host}/ws`;
  }
}
