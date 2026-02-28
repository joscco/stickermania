import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { OBJECT_TYPES, toCellKey, type ObjectType } from "@birthday/shared";
import { environment } from "../../../environments/environment";
import { WsService } from "../../core/ws.service";
import { WorldStore } from "../../core/world.store";

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './player.component.html'
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;

  public readonly objectTypes = OBJECT_TYPES;
  public readonly selectedType = signal<ObjectType>("tree");

  private longPressTimerHandle: number | null = null;

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
      onMessage: (message) => this.store.handleServerMessage(message)
    });
  }

  public ngOnDestroy(): void {
    this.wsService.disconnect();
    this.cancelLongPress();
  }

  public select(type: ObjectType): void {
    this.selectedType.set(type);
  }

  public resetWorld(): void {
    this.wsService.send({ type: "reset" });
  }

  public place(x: number, y: number): void {
    this.wsService.send({ type: "place", x, y, objectType: this.selectedType() });
  }

  public remove(event: MouseEvent, x: number, y: number): void {
    event.preventDefault();
    this.wsService.send({ type: "remove", x, y });
  }

  public startLongPress(x: number, y: number): void {
    this.cancelLongPress();
    this.longPressTimerHandle = window.setTimeout(() => {
      this.wsService.send({ type: "remove", x, y });
      this.longPressTimerHandle = null;
    }, 450);
  }

  public cancelLongPress(): void {
    if (this.longPressTimerHandle === null) {
      return;
    }
    window.clearTimeout(this.longPressTimerHandle);
    this.longPressTimerHandle = null;
  }

  public gridTemplateColumns(): string {
    const world = this.store.world();
    const width: number = world?.width ?? 30;
    // 2.25rem == 9 (tailwind) -> h-9 w-9
    return `repeat(${width}, 2.25rem)`;
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
    return `${protocol}://${window.location.host}/ws`;
  }
}
