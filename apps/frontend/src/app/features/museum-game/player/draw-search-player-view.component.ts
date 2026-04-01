import { Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { GameSessionStore } from "../../../core/challenge.store";
import { WebSocketService } from "../../../core/websocket.service";
import { WorldStore } from "../../../core/world.store";
import { PlayerMessageHandler } from "../../player/player-message-handler.service";
import { PlayerTimerService } from "../../player/player-timer.service";
import { SearchComponent } from "../player/search";
import { DrawComponent } from "../player/draw/draw.component";
import { LobbyReadyComponent } from "../../player/lobby/lobby-ready.component";
import { IdleSearchWaitingComponent } from "../../player/idle/idle-search-waiting.component";

@Component({
  selector: "app-draw-search-player-view",
  standalone: true,
  imports: [
    CommonModule,
    SearchComponent,
    DrawComponent,
    LobbyReadyComponent,
    IdleSearchWaitingComponent,
  ],
  template: `
    @if (gamePhase() === 'LOBBY' || gamePhase() === 'PAUSED') {
      <app-lobby-ready [playerName]="sessionStore.playerName()" />
    } @else {
      @switch (sessionStore.currentMode()) {
        @case ('DRAW') {
          @if (sessionStore.currentTask(); as task) {
            <app-draw
              [prompt]="task.prompt"
              [drawIndex]="messageHandler.drawCount()"
              [drawTotal]="messageHandler.maxDrawings()"
              [timeLeft]="timer.timeLeft()"
              (drawingSubmitted)="onDrawingSubmitted($event)"
            />
          }
        }
        @case ('SEARCH') {
          <app-search
            [sceneWidthPx]="sceneWidthPx()"
            [sceneHeightPx]="sceneHeightPx()"
            [timeLeft]="timer.timeLeft()"
          />
        }
        @default {
          <app-idle-search-waiting [timeLeft]="timer.timeLeft()" />
        }
      }
    }
  `,
})
export class DrawSearchPlayerViewComponent {
  private readonly ws = inject(WebSocketService);
  public readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  public readonly messageHandler = inject(PlayerMessageHandler);
  public readonly timer = inject(PlayerTimerService);

  public readonly gamePhase = computed(() => this.worldStore.round()?.phase ?? "LOBBY");
  public readonly sceneWidthPx = computed(() => this.worldStore.drawSearchModeState()?.effectiveFieldWidth ?? 400);
  public readonly sceneHeightPx = computed(() => this.worldStore.drawSearchModeState()?.effectiveFieldHeight ?? 400);

  public onDrawingSubmitted(dataUrl: string): void {
    this.ws.send({
      type: "game-action",
      mode: "draw-search",
      action: { type: "submit-drawing", imageDataUrl: dataUrl },
    });
    this.sessionStore.clearTask();
  }
}

