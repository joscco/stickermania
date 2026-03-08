import { DestroyRef, Injectable, computed, effect, inject, signal } from "@angular/core";
import { WebSocketService } from "../../../core/websocket.service";
import { AudioService } from "../../../core/audio.service";
import { GameSessionStore } from "../../../core/challenge.store";
import { WorldStore } from "../../../core/world.store";
import type { DrawSearchSearchTask, ServerToClientMessage } from "@birthday/shared";

@Injectable()
export class SearchStore {
  private readonly wsService = inject(WebSocketService);
  private readonly audioService = inject(AudioService);
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly destroyRef = inject(DestroyRef);

  public readonly feedback = signal<{ text: string; correct: boolean } | null>(null);

  public readonly currentTask = computed<DrawSearchSearchTask | null>(() => {
    const currentTask = this.sessionStore.currentTask();
    return currentTask?.mode === "SEARCH" ? currentTask : null;
  });

  private allFoundBannerShownForRevision: number | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeWs: (() => void) | null = null;

  public constructor() {
    this.unsubscribeWs = this.wsService.onMessage((message) => this.handleMessage(message));

    this.destroyRef.onDestroy(() => {
      if (this.unsubscribeWs) {
        this.unsubscribeWs();
      }

      if (this.feedbackTimer) {
        clearTimeout(this.feedbackTimer);
      }
    });

    effect(() => {
      const roundState = this.worldStore.round();
      const revision = this.worldStore.revision();
      const currentMode = this.sessionStore.currentMode();

      if (!roundState || roundState.phase !== "SEARCH" || currentMode !== "SEARCH") {
        return;
      }

      const drawings = Object.values(this.worldStore.drawings());

      if (drawings.length === 0) {
        return;
      }

      const allDrawingsFound = drawings.every((drawing) => !!drawing.foundBy);

      if (!allDrawingsFound) {
        return;
      }

      if (this.allFoundBannerShownForRevision === revision) {
        return;
      }

      this.allFoundBannerShownForRevision = revision;
      this.showFeedback("Letzter Begriff gefunden! 🎉", true);
      this.audioService.playRoundStart();
    });
  }

  public takeSnapshot(args: {
    centerContentX: number;
    centerContentY: number;
    radiusContent: number;
    sceneWidth: number;
    sceneHeight: number;
  }): void {
    if (!this.currentTask()) {
      return;
    }

    this.audioService.unlockIfNeeded();
    this.audioService.playShutter();

    this.wsService.send({
      type: "game-action",
      mode: "draw-search",
      action: {
        type: "search-snapshot",
        centerX: args.centerContentX,
        centerY: args.centerContentY,
        radius: args.radiusContent,
      },
    });
  }

  private handleMessage(message: ServerToClientMessage): void {
    if (message.type !== "game-event" || message.mode !== "draw-search") {
      return;
    }

    if (message.event.type !== "search-result") {
      return;
    }

    this.showFeedback(message.event.message, message.event.correct);

    if (message.event.correct) {
      this.audioService.playSuccess();
      this.sessionStore.clearTask();
    } else {
      this.audioService.playError();
    }
  }

  private showFeedback(text: string, correct: boolean): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }

    this.feedback.set({ text, correct });
    this.feedbackTimer = setTimeout(() => this.feedback.set(null), 2500);
  }
}
