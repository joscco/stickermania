import type {GameServerEnvelope, SessionState, StickerCollageServerEvent} from "@stickermania/shared";

export interface SessionServiceEvents {
    onSessionStateChanged?: (sessionId: string, state: SessionState) => void | Promise<void>;
    onSessionGameEvents?: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>;
}

function targetPlayerIdFor(event: StickerCollageServerEvent): string | undefined {
    return "targetPlayerId" in event && typeof event.targetPlayerId === "string"
        ? event.targetPlayerId
        : undefined;
}

/**
 * Handles state-change broadcasts and game-event wrapping/publishing.
 */
export class SessionEventPublisher {
    private readonly callbacks: SessionServiceEvents = {};

    public setOnSessionStateChanged(callback: (sessionId: string, state: SessionState) => void | Promise<void>): void {
        this.callbacks.onSessionStateChanged = callback;
    }

    public setOnSessionGameEvents(callback: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>): void {
        this.callbacks.onSessionGameEvents = callback;
    }

    public bumpRevision(state: SessionState): void {
        state.revision += 1;
        state.updatedAt = Date.now();
    }

    public async publishState(state: SessionState): Promise<void> {
        if (this.callbacks.onSessionStateChanged) {
            await this.callbacks.onSessionStateChanged(state.sessionId, state);
        }
    }

    public async publishGameEvents(sessionId: string, events: StickerCollageServerEvent[]): Promise<void> {
        if (!this.callbacks.onSessionGameEvents) {
            return;
        }

        const wrapped: GameServerEnvelope[] = events.map(event => {
            const envelope: GameServerEnvelope = {type: "game-event", event};
            const targetPlayerId = targetPlayerIdFor(event);
            if (targetPlayerId) {
                envelope.targetPlayerId = targetPlayerId;
            }
            return envelope;
        });

        await this.callbacks.onSessionGameEvents(sessionId, wrapped);
    }
}
