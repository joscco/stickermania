import type {SessionState} from "@birthday/shared";
import type {GameModeRegistry} from "../game-modes/gameModeRegistry.js";
import type {RuntimeEntry} from "./sessionRuntimeTypes.js";
import type {SessionMutator} from "./sessionMutator.js";

/**
 * Manages phase-timer scheduling for game mode engines.
 *
 * Engines can request a "next timer at" timestamp. This scheduler sets a
 * setTimeout for that moment, fires `onTimerElapsed`, publishes results,
 * and recurses.
 *
 * All state-mutating timer callbacks run through the SessionMutator to
 * prevent race conditions with concurrent game-actions.
 */
export class PhaseTimerScheduler {
    public constructor(
        private readonly runtimes: Map<string, RuntimeEntry>,
        private readonly gameModeRegistry: GameModeRegistry,
        private readonly mutator: SessionMutator,
    ) {}

    public schedule(sessionId: string, state: SessionState): void {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) {
            return;
        }

        this.clear(sessionId);

        const engine = this.gameModeRegistry.get(state.activeMode);
        if (!engine.getNextTimerAt) {
            return;
        }

        const nextTimerAt = engine.getNextTimerAt({sessionState: state as never, now: Date.now()});
        if (nextTimerAt === null) {
            return;
        }

        const delayMs = Math.max(0, nextTimerAt - Date.now());

        runtime.phaseTimer = setTimeout(() => {
            runtime.phaseTimer = null;

            this.mutator.mutate(sessionId, async (currentState) => {
                if (!engine.onTimerElapsed) {
                    return {stateChanged: false, extra: undefined};
                }

                const result = await engine.onTimerElapsed({
                    sessionState: currentState as never,
                    now: Date.now(),
                });

                return {
                    stateChanged: result.stateChanged,
                    gameEvents: result.emittedEvents.length > 0
                        ? {mode: currentState.activeMode, events: result.emittedEvents as any[]}
                        : undefined,
                    extra: undefined,
                };
            }).then((outcome) => {
                // Recurse – schedule next timer based on the fresh state
                if (outcome) {
                    this.schedule(sessionId, outcome.state);
                }
            }).catch((err) => {
                console.error(`[PhaseTimer] Error in timer callback for session ${sessionId}:`, err);
            });
        }, delayMs);
    }

    public clear(sessionId: string): void {
        const runtime = this.runtimes.get(sessionId);
        if (runtime?.phaseTimer) {
            clearTimeout(runtime.phaseTimer);
            runtime.phaseTimer = null;
        }
    }
}
