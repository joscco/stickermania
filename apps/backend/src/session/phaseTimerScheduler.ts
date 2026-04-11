import type {SessionState} from "@birthday/shared";
import type {GameEngineRegistry} from "../game-modes/gameModeRegistry.js";
import type {RuntimeEntry} from "./sessionRuntimeTypes.js";
import type {SessionMutator} from "./sessionMutator.js";

/**
 * Manages phase-timer scheduling.
 * Sets a setTimeout for the engine's next timer, fires onTimerElapsed,
 * publishes results, and recurses.
 * All callbacks run through SessionMutator to prevent race conditions.
 */
export class PhaseTimerScheduler {
    public constructor(
        private readonly runtimes: Map<string, RuntimeEntry>,
        private readonly engineRegistry: GameEngineRegistry,
        private readonly mutator: SessionMutator,
    ) {}

    public schedule(sessionId: string, state: SessionState): void {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) {
            return;
        }

        this.clear(sessionId);

        const engine = this.engineRegistry.get();
        const nextTimerAt = engine.getNextTimerAt({sessionState: state, now: Date.now()});
        if (nextTimerAt === null) {
            return;
        }

        const delayMs = Math.max(0, nextTimerAt - Date.now());

        runtime.phaseTimer = setTimeout(() => {
            runtime.phaseTimer = null;

            this.mutator.mutate(sessionId, async (currentState) => {
                const result = await engine.onTimerElapsed({sessionState: currentState, now: Date.now()});

                return {
                    stateChanged: result.stateChanged,
                    gameEvents: result.emittedEvents.length > 0 ? result.emittedEvents : undefined,
                    extra: undefined,
                };
            }).then((outcome) => {
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
