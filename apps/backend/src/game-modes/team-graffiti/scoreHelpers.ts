import type {TeamGraffitiHouse, TeamGraffitiModeState, TeamGraffitiTeamId} from "@birthday/shared";

/**
 * Settle ownership of a house: add held-time score to the owning team and clear ownership.
 * Returns the previous owner if any score was settled.
 */
export function settleHouseOwnership(
    house: TeamGraffitiHouse,
    teams: Record<TeamGraffitiTeamId, {score: number}>,
    now: number,
): TeamGraffitiTeamId | null {
    if (!house.owner || !house.ownedSince) {
        return null;
    }

    const heldSeconds = Math.max(0, Math.floor((now - house.ownedSince) / 1000));
    teams[house.owner].score += heldSeconds;

    return house.owner;
}

/**
 * Finalize scores for all owned houses at the given end time.
 */
export function finalizeScores(modeState: TeamGraffitiModeState, endTime: number): void {
    for (const house of Object.values(modeState.houses) as TeamGraffitiHouse[]) {
        if (house.owner && house.ownedSince) {
            settleHouseOwnership(house, modeState.teams, endTime);
            house.ownedSince = endTime;
        }
    }
}

