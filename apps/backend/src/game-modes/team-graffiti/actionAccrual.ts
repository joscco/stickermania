import type {TeamGraffitiModeState, TeamGraffitiPlayerActions} from "@birthday/shared";

/**
 * Accrue timer-based actions for a single player up to the current time.
 */
export function accrueActionsForPlayer(modeState: TeamGraffitiModeState, playerId: string, now: number): void {
    if (!modeState.roundStartedAt) {
        return;
    }

    const playerActions = modeState.playerActions[playerId];
    if (!playerActions) {
        return;
    }

    const intervalMs = modeState.actionAccrualIntervalSec * 1000;
    while (playerActions.lastAccrualAt + intervalMs <= now && playerActions.actions < modeState.maxActions) {
        playerActions.actions += 1;
        playerActions.lastAccrualAt += intervalMs;
    }

    // When at max, fast-forward so spending an action doesn't cause instant refill.
    if (playerActions.actions >= modeState.maxActions) {
        playerActions.lastAccrualAt = now;
    }
}

/**
 * Accrue actions for all players. Returns a list of update events.
 */
export function accrueAllActions(
    modeState: TeamGraffitiModeState,
    now: number,
): Array<{type: "actions-updated"; playerId: string; actions: number}> {
    const events: Array<{type: "actions-updated"; playerId: string; actions: number}> = [];
    const intervalMs = modeState.actionAccrualIntervalSec * 1000;

    for (const [playerId, pa] of Object.entries(modeState.playerActions) as [string, TeamGraffitiPlayerActions][]) {
        if (pa.actions >= modeState.maxActions) {
            pa.lastAccrualAt = now;
            continue;
        }

        while (pa.lastAccrualAt + intervalMs <= now && pa.actions < modeState.maxActions) {
            pa.actions += 1;
            pa.lastAccrualAt += intervalMs;
        }

        // When at max, fast-forward so spending an action doesn't cause instant refill.
        if (pa.actions >= modeState.maxActions) {
            pa.lastAccrualAt = now;
        }

        events.push({
            type: "actions-updated",
            playerId,
            actions: pa.actions,
        });
    }

    return events;
}

/**
 * Compute the next time an action accrual tick should fire, or null if none needed.
 */
export function computeNextAccrualTime(modeState: TeamGraffitiModeState): number | null {
    if (!modeState.roundStartedAt || !modeState.roundEndsAt) {
        return null;
    }

    const intervalMs = modeState.actionAccrualIntervalSec * 1000;
    let earliest: number | null = null;

    for (const pa of Object.values(modeState.playerActions) as TeamGraffitiPlayerActions[]) {
        if (pa.actions >= modeState.maxActions) continue;
        const nextAt = pa.lastAccrualAt + intervalMs;
        if (earliest === null || nextAt < earliest) {
            earliest = nextAt;
        }
    }

    if (earliest !== null && earliest > modeState.roundEndsAt) {
        return modeState.roundEndsAt;
    }

    return earliest;
}

