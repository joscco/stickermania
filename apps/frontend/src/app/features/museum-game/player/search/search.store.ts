import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import type { DrawSearchSearchTask, ServerToClientMessage } from "@birthday/shared";
import {WebSocketService} from '../../../../core/websocket.service';
import {GameSessionStore} from '../../../../core/challenge.store';

@Injectable()
export class SearchStore {
  private readonly wsService = inject(WebSocketService);
  private readonly sessionStore = inject(GameSessionStore);
  private readonly destroyRef = inject(DestroyRef);

  public readonly feedback = signal<{ text: string; correct: boolean } | null>(null);

  public readonly currentTask = computed<DrawSearchSearchTask | null>(() => {
    const currentTask = this.sessionStore.currentTask();
    return currentTask?.mode === "SEARCH" ? currentTask : null;
  });

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

    // this.audioService.unlockIfNeeded();
    // this.audioService.playShutter();

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
      // this.audioService.playSuccess();
      this.sessionStore.clearTask();
    } else {
      // this.audioService.playError();
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
