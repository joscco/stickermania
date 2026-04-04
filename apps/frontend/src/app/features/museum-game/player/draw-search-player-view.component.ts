import {Component, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {GameSessionStore} from "../../../core/challenge.store";
import {WebSocketService} from "../../../core/websocket.service";
import {PlayerMessageHandler} from "../../player/player-message-handler.service";
import {PlayerTimerService} from "../../player/player-timer.service";
import {DrawComponent} from "./draw/draw.component";
import {CaptionComponent} from "./caption/caption.component";
import {GuessComponent} from "./guess/guess.component";
import {IdleSearchWaitingComponent} from "../../player/idle/idle-search-waiting.component";

@Component({
  selector: "app-draw-search-player-view",
  standalone: true,
  imports: [
    CommonModule,
    DrawComponent,
    CaptionComponent,
    GuessComponent,
    IdleSearchWaitingComponent,
  ],
  templateUrl: "./draw-search-player-view.component.html",
})
export class DrawSearchPlayerViewComponent {
  private readonly ws = inject(WebSocketService);
  public readonly sessionStore = inject(GameSessionStore);
  public readonly messageHandler = inject(PlayerMessageHandler);
  public readonly timer = inject(PlayerTimerService);


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
