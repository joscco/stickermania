import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {GameSessionStore} from "../../../core/challenge.store";
import {WebSocketService} from "../../../core/websocket.service";
import {WorldStore} from "../../../core/world.store";
import {PlayerMessageHandler} from "../../player/player-message-handler.service";
import {PlayerTimerService} from "../../player/player-timer.service";
import {DrawComponent} from "../player/draw/draw.component";
import {CaptionComponent} from "../player/caption/caption.component";
import {GuessComponent} from "../player/guess/guess.component";
import {LobbyReadyComponent} from "../../player/lobby/lobby-ready.component";
import {IdleSearchWaitingComponent} from "../../player/idle/idle-search-waiting.component";

@Component({
  selector: "app-draw-search-player-view",
  standalone: true,
  imports: [
    CommonModule,
    DrawComponent,
    CaptionComponent,
    GuessComponent,
    LobbyReadyComponent,
    IdleSearchWaitingComponent,
  ],
  template: `
    @if (gamePhase() === 'LOBBY') {
      <app-lobby-ready [playerName]="sessionStore.playerName()" />
    } @else {
      @switch (sessionStore.currentMode()) {
        @case ('DRAW') {
          @if (sessionStore.currentTask(); as task) {
            <app-draw
              [prompt]="$any(task).prompt"
              [drawIndex]="0"
              [drawTotal]="0"
              [timeLeft]="''"
              (drawingSubmitted)="onDrawingSubmitted($event)"
            />
          }
        }
        @case ('CAPTION') {
          @if (sessionStore.currentTask(); as task) {
            <app-caption
              [task]="$any(task)"
              (captionSubmitted)="onCaptionSubmitted($event)"
            />
          }
        }
        @case ('GUESS') {
          @if (sessionStore.currentTask(); as task) {
            <app-guess
              [task]="$any(task)"
              (guessSubmitted)="onGuessSubmitted($event)"
            />
          }
        }
        @default {
          <app-idle-search-waiting [timeLeft]="''" />
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

  public readonly gamePhase = computed(() => this.worldStore.drawSearchPhase());

  public onDrawingSubmitted(dataUrl: string): void {
    this.ws.send({
      type: "game-action",
      mode: "draw-search",
      action: { type: "submit-drawing", imageDataUrl: dataUrl },
    });
    this.sessionStore.clearTask();
  }

  public onCaptionSubmitted(event: { drawingId: string; text: string }): void {
    this.ws.send({
      type: "game-action",
      mode: "draw-search",
      action: { type: "submit-caption", drawingId: event.drawingId, text: event.text },
    });
  }

  public onGuessSubmitted(event: { drawingId: string; captionId: string }): void {
    this.ws.send({
      type: "game-action",
      mode: "draw-search",
      action: { type: "submit-guess", drawingId: event.drawingId, captionId: event.captionId },
    });
  }
}
