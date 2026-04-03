import type {SessionState, TeamGraffitiModeState} from "@birthday/shared";

/**
 * Initialise or reset player-actions entries for all current players.
 */
export function initPlayerActions(
    modeState: TeamGraffitiModeState,
    playerIds: string[],
    initialActions: number,
    now: number,
): void {
    for (const playerId of playerIds) {
        if (!modeState.playerActions[playerId]) {
            modeState.playerActions[playerId] = {actions: 0, lastAccrualAt: now};
        }
        modeState.playerActions[playerId].actions = initialActions;
        modeState.playerActions[playerId].lastAccrualAt = now;
    }
}

/**
 * Start a timed round: set timestamps and reset all player actions.
 */
export function startRound(
    sessionState: SessionState<TeamGraffitiModeState>,
    durationSec: number,
    initialActions: number,
    now: number,
): void {
    const modeState = sessionState.modeState;
    modeState.roundStartedAt = now;
    modeState.roundEndsAt = now + durationSec * 1000;

    initPlayerActions(
        modeState,
        Object.keys(sessionState.players),
        initialActions,
        now,
    );
}

