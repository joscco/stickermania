import type {
    SessionState,
    TeamGraffitiModeState,
    TeamGraffitiTeamId,
} from "@birthday/shared";
import type {GameActionResult} from "../gameModeEngine.js";
import {settleHouseOwnership} from "./scoreHelpers.js";

export function handleAssignTeam(
    sessionState: SessionState<TeamGraffitiModeState>,
    playerId: string,
    teamId: TeamGraffitiTeamId,
): GameActionResult<"team-graffiti"> {
    const player = sessionState.players[playerId];
    if (!player) return {stateChanged: false, emittedEvents: []};

    player.teamId = teamId;

    return {
        stateChanged: true,
        emittedEvents: [{type: "team-assigned", playerId, teamId}],
    };
}

export function handleTagHouse(
    sessionState: SessionState<TeamGraffitiModeState>,
    playerId: string,
    houseId: string,
    now: number,
): GameActionResult<"team-graffiti"> {
    const player = sessionState.players[playerId];
    if (!player || !player.teamId) return {stateChanged: false, emittedEvents: []};

    const modeState = sessionState.modeState;
    const house = modeState.houses[houseId];
    if (!house) return {stateChanged: false, emittedEvents: []};

    if (!modeState.roundStartedAt || !modeState.roundEndsAt || now >= modeState.roundEndsAt) {
        return {stateChanged: false, emittedEvents: []};
    }

    const teamId = player.teamId as TeamGraffitiTeamId;
    if (house.owner === teamId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const pa = modeState.playerActions[playerId];
    if (!pa || pa.actions <= 0) {
        return {stateChanged: false, emittedEvents: []};
    }

    // Settle previous ownership score
    settleHouseOwnership(house, modeState.teams, now);

    pa.actions -= 1;

    const tagVariant = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    house.owner = teamId;
    house.tagVariant = tagVariant;
    house.ownedSince = now;

    return {
        stateChanged: true,
        emittedEvents: [
            {type: "house-tagged", houseId, teamId, tagVariant},
            {type: "actions-updated", playerId, actions: pa.actions},
        ],
    };
}

export function handleWipeHouse(
    sessionState: SessionState<TeamGraffitiModeState>,
    playerId: string,
    houseId: string,
    now: number,
): GameActionResult<"team-graffiti"> {
    const player = sessionState.players[playerId];
    if (!player || !player.teamId) return {stateChanged: false, emittedEvents: []};

    const modeState = sessionState.modeState;
    const house = modeState.houses[houseId];
    if (!house) return {stateChanged: false, emittedEvents: []};

    if (!modeState.roundStartedAt || !modeState.roundEndsAt || now >= modeState.roundEndsAt) {
        return {stateChanged: false, emittedEvents: []};
    }

    const teamId = player.teamId as TeamGraffitiTeamId;
    if (!house.owner || house.owner === teamId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const playerActions = modeState.playerActions[playerId];
    if (!playerActions || playerActions.actions <= 0) {
        return {stateChanged: false, emittedEvents: []};
    }

    // Settle previous ownership score
    const previousOwner = house.owner;
    settleHouseOwnership(house, modeState.teams, now);

    playerActions.actions -= 1;

    house.owner = null;
    house.tagVariant = 0;
    house.ownedSince = null;

    return {
        stateChanged: true,
        emittedEvents: [
            {type: "house-wiped", houseId, wipedByPlayerId: playerId},
            {type: "team-score-updated", teamId: previousOwner, newScore: modeState.teams[previousOwner].score},
            {type: "actions-updated", playerId, actions: playerActions.actions},
        ],
    };
}

