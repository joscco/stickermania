import {inject, Injectable} from "@angular/core";
import type {DrawSearchServerEvent, SessionState} from "@birthday/shared";
import {GameSessionStore} from "../../../core/challenge.store";

/**
 * Handles draw-search game events and reconnect state-sync.
 */
@Injectable()
export class DrawSearchEventHandler {
    private readonly sessionStore = inject(GameSessionStore);

    public handleEvent(event: DrawSearchServerEvent): void {
        switch (event.type) {
            case "assign-task":
                this.sessionStore.setTask(event.task);
                break;

            case "score-update":
                if (event.playerId === this.sessionStore.playerId()) {
                    this.sessionStore.showFeedback(`+Punkte! ${event.reason}`, "success");
                }
                break;

            case "guess-result":
                this.sessionStore.setGuessResult({
                    correct: event.correct,
                    message: event.message,
                    correctTitle: event.correctTitle,
                    drawingId: event.drawingId,
                });
                break;

            case "caption-rejected":
                this.sessionStore.showFeedback(event.reason, "error");
                break;

            case "round-phase":
                // Phase is always ACTIVE now — nothing to do
                break;
        }
    }

    /**
     * Restore the correct player UI mode after a reconnect / session-state update.
     */
    public syncMode(sessionState: SessionState): void {
        // In ACTIVE phase the server re-sends the task via onPlayerJoined.
        // Don't overwrite an existing task or an active draw-search UI mode.
        if (this.sessionStore.currentTask()) {
          return;
        }

        const current = this.sessionStore.currentMode();
        if (current === "DRAW" || current === "CAPTION" || current === "GUESS") {
          return;
        }

        this.sessionStore.clearTask("IDLE");
    }
}

