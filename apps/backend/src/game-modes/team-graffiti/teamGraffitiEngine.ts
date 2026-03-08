import crypto from "node:crypto";
import type {
    SessionState,
    TeamGraffitiClientAction,
    TeamGraffitiModeState,
    TeamGraffitiTag,
    TeamGraffitiTeamId,
} from "@birthday/shared";
import {GameActionResult, GameModeEngine} from "../gameModeEngine.js";

export class TeamGraffitiEngine implements GameModeEngine<"team-graffiti", TeamGraffitiModeState> {
    public readonly mode = "team-graffiti" as const;

    public createInitialState(): TeamGraffitiModeState {
        return {
            mode: "team-graffiti",
            roundStartedAt: null,
            roundEndsAt: null,
            teams: {
                RED: { score: 0 },
                BLUE: { score: 0 },
            },
            buildings: {
                townhall: { id: "townhall", name: "Rathaus", x: 100, y: 100 },
                fountain: { id: "fountain", name: "Brunnen", x: 300, y: 180 },
                museum: { id: "museum", name: "Museum", x: 480, y: 240 },
            },
            activeTags: {},
            removedTags: {},
        };
    }

    public onPlayerJoined(): GameActionResult<"team-graffiti"> {
        return {
            stateChanged: false,
            emittedEvents: [],
        };
    }

    public startMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): GameActionResult<"team-graffiti"> {
        args.sessionState.modeState.roundStartedAt = args.now;
        args.sessionState.modeState.roundEndsAt = args.now + 10 * 60 * 1000;

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    public resetMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
    }): GameActionResult<"team-graffiti"> {
        args.sessionState.modeState = this.createInitialState();

        for (const player of Object.values(args.sessionState.players)) {
            player.teamId = null;
        }

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    public applyAction(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        action: TeamGraffitiClientAction;
        context: { playerId: string; now: number };
    }): GameActionResult<"team-graffiti"> {
        switch (args.action.type) {
            case "assign-team": {
                return this.handleAssignTeam(args.sessionState, args.action.playerId, args.action.teamId);
            }

            case "place-tag": {
                return this.handlePlaceTag(args.sessionState, args.context.playerId, args.action.buildingId, args.context.now);
            }

            case "wipe-tag": {
                return this.handleWipeTag(args.sessionState, args.context.playerId, args.action.tagId, args.action.progressDelta, args.context.now);
            }

            case "start-team-round": {
                args.sessionState.modeState.roundStartedAt = args.context.now;
                args.sessionState.modeState.roundEndsAt = args.context.now + args.action.durationSec * 1000;

                return {
                    stateChanged: true,
                    emittedEvents: [],
                };
            }

            default: {
                return {
                    stateChanged: false,
                    emittedEvents: [],
                };
            }
        }
    }

    private handleAssignTeam(
        sessionState: SessionState<TeamGraffitiModeState>,
        playerId: string,
        teamId: TeamGraffitiTeamId,
    ): GameActionResult<"team-graffiti"> {
        const player = sessionState.players[playerId];

        if (!player) {
            return { stateChanged: false, emittedEvents: [] };
        }

        player.teamId = teamId;

        return {
            stateChanged: true,
            emittedEvents: [
                {
                    type: "team-assigned",
                    playerId,
                    teamId,
                },
            ],
        };
    }

    private handlePlaceTag(
        sessionState: SessionState<TeamGraffitiModeState>,
        playerId: string,
        buildingId: string,
        now: number,
    ): GameActionResult<"team-graffiti"> {
        const player = sessionState.players[playerId];

        if (!player || !player.teamId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        if (!sessionState.modeState.buildings[buildingId]) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const tagId = crypto.randomUUID();
        const createdTag: TeamGraffitiTag = {
            id: tagId,
            buildingId,
            placedByPlayerId: playerId,
            teamId: player.teamId as TeamGraffitiTeamId,
            placedAt: now,
            removedAt: null,
            wipeProgress: 0,
            active: true,
        };

        sessionState.modeState.activeTags[tagId] = createdTag;

        return {
            stateChanged: true,
            emittedEvents: [
                {
                    type: "tag-placed",
                    tagId,
                    buildingId,
                    teamId: createdTag.teamId,
                },
            ],
        };
    }

    private handleWipeTag(
        sessionState: SessionState<TeamGraffitiModeState>,
        playerId: string,
        tagId: string,
        progressDelta: number,
        now: number,
    ): GameActionResult<"team-graffiti"> {
        const player = sessionState.players[playerId];
        const tag = sessionState.modeState.activeTags[tagId];

        if (!player || !player.teamId || !tag) {
            return { stateChanged: false, emittedEvents: [] };
        }

        if (player.teamId === tag.teamId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        tag.wipeProgress += progressDelta;

        if (tag.wipeProgress < 100) {
            return {
                stateChanged: true,
                emittedEvents: [],
            };
        }

        tag.active = false;
        tag.removedAt = now;

        delete sessionState.modeState.activeTags[tagId];
        sessionState.modeState.removedTags[tagId] = tag;

        const aliveSeconds = Math.max(0, Math.floor((tag.removedAt - tag.placedAt) / 1000));
        const currentScore = sessionState.modeState.teams[tag.teamId].score + aliveSeconds;
        sessionState.modeState.teams[tag.teamId].score = currentScore;

        return {
            stateChanged: true,
            emittedEvents: [
                {
                    type: "tag-removed",
                    tagId,
                    removedByPlayerId: playerId,
                    scoreAwarded: aliveSeconds,
                },
                {
                    type: "team-score-updated",
                    teamId: tag.teamId,
                    newScore: currentScore,
                },
            ],
        };
    }
}