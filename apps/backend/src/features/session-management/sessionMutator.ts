import type {SessionState, StickerCollageServerEvent} from "@stickermania/shared";
import type {SessionRepository} from "../../infrastructure/sessionRepository.js";
import type {SessionEventPublisher} from "./sessionEventPublisher.js";
import {SessionLock} from "./sessionLock.js";

/**
 * Return value from a mutation callback.
 *
 * - `state` — the (possibly mutated) session state
 * - `stateChanged` — whether the state was modified (triggers save + broadcast)
 * - `publishState` — set to `false` to save/revision the state without broadcasting the full state
 * - `gameEvents` — optional game events to broadcast
 * - `extra` — arbitrary extra data the caller wants back (e.g. a player object)
 */
export interface MutationResult<TExtra = void> {
    stateChanged: boolean;
    publishState?: boolean;
    gameEvents?: StickerCollageServerEvent[];
    extra: TExtra;
}

/**
 * Centralises the Lock → Load → Mutate → Save → Publish cycle that
 * every state-changing operation needs.
 *
 * Usage:
 * ```ts
 * const player = await mutator.mutate(sessionId, async (state) => {
 *     const p = state.players[playerId];
 *     p.name = "Alice";
 *     return { stateChanged: true, extra: p };
 * });
 * ```
 */
export class SessionMutator {
    private sessionLock: SessionLock;

    public constructor(
        private readonly sessionRepository: SessionRepository,
        private readonly eventPublisher: SessionEventPublisher,
    ) {
        this.sessionLock = new SessionLock();
    }

    /**
     * Run `fn` inside a per-session lock, loading state before and
     * saving + publishing after if the mutation reports a change.
     *
     * Returns `null` when the session doesn't exist.
     */
    public async mutate<TExtra = void>(
        sessionId: string,
        fn: (state: SessionState) => Promise<MutationResult<TExtra>> | MutationResult<TExtra>,
    ): Promise<{ state: SessionState; extra: TExtra } | null> {
        return this.sessionLock.run(sessionId, async () => {
            const state = await this.sessionRepository.load(sessionId);
            if (!state) {
                return null;
            }

            const result = await fn(state);

            if (result.stateChanged) {
                this.eventPublisher.bumpRevision(state);
                await this.sessionRepository.save(state);
                if (result.publishState !== false) {
                    await this.eventPublisher.publishState(state);
                }
            }

            if (result.gameEvents && result.gameEvents.length > 0) {
                await this.eventPublisher.publishGameEvents(sessionId, result.gameEvents);
            }

            return {state, extra: result.extra};
        });
    }
}
