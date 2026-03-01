import { Injectable, computed, signal, effect, DestroyRef, inject } from "@angular/core";
import { WebSocketService } from "../../../core/websocket.service";
import { AudioService } from "../../../core/audio.service";
import { GameSessionStore } from "../../../core/challenge.store";
import { WorldStore } from "../../../core/world.store";
import type { SearchTask, ServerToClientMessage } from "@birthday/shared";

/**
 * State & logic for the SEARCH phase.
 *
 * Owns:
 *  – search feedback (toast after snapshot)
 *  – "all found" banner detection
 *  – snapshot submission to the server
 *  – the derived `currentSearchTask` signal
 *
 * Provided at the SearchComponent level so each instance gets its own store.
 */
@Injectable()
export class SearchStore {
  private readonly ws = inject(WebSocketService);
  private readonly audio = inject(AudioService);
  private readonly session = inject(GameSessionStore);
  private readonly world = inject(WorldStore);
  private readonly destroyRef = inject(DestroyRef);

  /** Toast-like overlay feedback after a snapshot attempt. */
  public readonly feedback = signal<{ text: string; correct: boolean } | null>(null);

  /** The currently assigned search task (or null). */
  public readonly currentTask = computed<SearchTask | null>(() => {
    const task = this.session.currentTask();
    return task?.mode === "SEARCH" ? task : null;
  });

  private allFoundBannerShownForRevision: number | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeWs: (() => void) | null = null;

  constructor() {
    // Subscribe to WS for search-result messages
    this.unsubscribeWs = this.ws.onMessage((msg) => this.handleMessage(msg));
    this.destroyRef.onDestroy(() => {
      if (this.unsubscribeWs) this.unsubscribeWs();
      if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    });

    // "All found" banner effect
    effect(() => {
      const round = this.world.round();
      const revision = this.world.revision();
      const mode = this.session.currentMode();
      if (!round || round.phase !== "SEARCH" || mode !== "SEARCH") return;

      const drawings = Object.values(this.world.drawings());
      if (drawings.length === 0) return;

      const allFound = drawings.every((d) => !!d.foundBy);
      if (!allFound) return;
      if (this.allFoundBannerShownForRevision === revision) return;

      this.allFoundBannerShownForRevision = revision;
      this.showFeedback("Letzter Begriff gefunden! 🎉", true);
      this.audio.playRoundStart();
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────

  /**
   * Submit a search snapshot to the server.
   */
  public takeSnapshot(args: {
    centerContentX: number;
    centerContentY: number;
    radiusContent: number;
    sceneWidth: number;
    sceneHeight: number;
  }): void {
    if (!this.currentTask()) return;

    this.audio.unlockIfNeeded();
    this.audio.playShutter();

    this.ws.send({
      type: "search-snapshot",
      centerX: args.centerContentX / args.sceneWidth,
      centerY: args.centerContentY / args.sceneHeight,
      radius: args.radiusContent / args.sceneWidth,
    });
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private handleMessage(msg: ServerToClientMessage): void {
    if (msg.type !== "search-result") return;

    this.showFeedback(msg.message, msg.correct);

    if (msg.correct) {
      this.audio.playSuccess();
      // Clear the active task so the UI doesn't keep showing the old prompt
      this.session.currentTask.set(null);
    } else {
      this.audio.playError();
    }
  }

  private showFeedback(text: string, correct: boolean): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedback.set({ text, correct });
    this.feedbackTimer = setTimeout(() => this.feedback.set(null), 2500);
  }
}

