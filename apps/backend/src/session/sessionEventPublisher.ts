import type {GameModeId, GameServerEnvelope, SessionState} from "@birthday/shared";

export interface SessionServiceEvents {
    onSessionStateChanged?: (sessionId: string, state: SessionState) => void | Promise<void>;
    onSessionGameEvents?: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>;
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

    public async publishGameEvents<TMode extends GameModeId>(
        sessionId: string,
        mode: TMode,
        events: Array<any>,
    ): Promise<void> {
        if (!this.callbacks.onSessionGameEvents) {
            return;
        }

        const wrappedEvents: GameServerEnvelope[] = events.map((event) => {
            const envelope: any = {
                type: "game-event",
                mode,
                event,
            };
            if (event.targetPlayerId) {
                envelope.targetPlayerId = event.targetPlayerId;
            }
            return envelope;
        }) as GameServerEnvelope[];

        await this.callbacks.onSessionGameEvents(sessionId, wrappedEvents);
    }
}

