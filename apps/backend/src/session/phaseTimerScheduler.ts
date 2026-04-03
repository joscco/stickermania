import type {SessionState} from "@birthday/shared";
import type {SessionRepository} from "../infra/sessionRepository.js";
import type {GameModeRegistry} from "../game-modes/gameModeRegistry.js";
import type {RuntimeEntry} from "./sessionRuntimeTypes.js";
import {SessionEventPublisher} from "./sessionEventPublisher.js";

/**
 * Manages phase-timer scheduling for game mode engines.
 *
 * Engines can request a "next timer at" timestamp. This scheduler sets a
 * setTimeout for that moment, fires `onTimerElapsed`, publishes results,
 * and recurses.
 */
export class PhaseTimerScheduler {
    public constructor(
        private readonly runtimes: Map<string, RuntimeEntry>,
        private readonly sessionRepository: SessionRepository,
        private readonly gameModeRegistry: GameModeRegistry,
        private readonly eventPublisher: SessionEventPublisher,
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

        runtime.phaseTimer = setTimeout(async () => {
            runtime.phaseTimer = null;

            if (!engine.onTimerElapsed) {
                return;
            }

            const currentState = await this.sessionRepository.load(sessionId);
            if (!currentState) {
                return;
            }

            const result = await engine.onTimerElapsed({
                sessionState: currentState as never,
                now: Date.now(),
            });

            if (result.stateChanged) {
                this.eventPublisher.bumpRevision(currentState);
                await this.sessionRepository.save(currentState);
                await this.eventPublisher.publishState(currentState);
            }

            if (result.emittedEvents.length > 0) {
                await this.eventPublisher.publishGameEvents(sessionId, currentState.activeMode, result.emittedEvents as never[]);
            }

            // Recurse
            this.schedule(sessionId, currentState);
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

