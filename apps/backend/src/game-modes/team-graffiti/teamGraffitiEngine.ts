import type {
    GameConfig,
    SessionPlayer,
    SessionState,
    TeamGraffitiClientAction,
    TeamGraffitiHouse,
    TeamGraffitiModeState,
} from "@birthday/shared";
import {GameActionResult, GameModeEngine} from "../gameModeEngine.js";
import {HOUSE_LAYOUT, SCENE_HEIGHT, SCENE_WIDTH} from "./houseLayout.js";
import {accrueActionsForPlayer, accrueAllActions, computeNextAccrualTime} from "./actionAccrual.js";
import {finalizeScores} from "./scoreHelpers.js";
import {handleAssignTeam, handleTagHouse} from "./actionHandlers.js";
import {startRound} from "./roundManager.js";

export class TeamGraffitiEngine implements GameModeEngine<"team-graffiti", TeamGraffitiModeState> {
    public readonly mode = "team-graffiti" as const;

    public constructor(private readonly config: GameConfig) {}

    public createInitialState(): TeamGraffitiModeState {
        const houses: Record<string, TeamGraffitiHouse> = {};

        HOUSE_LAYOUT.forEach((def, index) => {
            const id = String(index);
            houses[id] = {
                id,
                houseType: def.houseType,
                x: def.x,
                y: def.y,
                flipped: def.flipped,
                owner: null,
                tagVariant: 0,
                ownedSince: null,
            };
        });

        return {
            mode: "team-graffiti",
            roundStartedAt: null,
            roundEndsAt: null,
            teams: {
                DIAMOND: {score: 0},
                HEART: {score: 0},
            },
            houses,
            playerActions: {},
            actionAccrualIntervalSec: this.config.teamGraffiti.actionAccrualIntervalSec,
            maxActions: this.config.teamGraffiti.maxActions,
            sceneWidth: SCENE_WIDTH,
            sceneHeight: SCENE_HEIGHT,
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        player: { id: string };
        now: number;
    }): GameActionResult<"team-graffiti"> {
        const modeState = args.sessionState.modeState;

        if (!modeState.playerActions[args.player.id]) {
            modeState.playerActions[args.player.id] = {
                actions: modeState.roundStartedAt ? this.config.teamGraffiti.initialActions : 0,
                lastAccrualAt: args.now,
            };
        }

        return {stateChanged: true, emittedEvents: []};
    }

    public startMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): GameActionResult<"team-graffiti"> {
        startRound(
            args.sessionState,
            this.config.teamGraffiti.roundDurationSec,
            this.config.teamGraffiti.initialActions,
            args.now,
        );
        return {stateChanged: true, emittedEvents: []};
    }

    public resetMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
    }): GameActionResult<"team-graffiti"> {
        args.sessionState.modeState = this.createInitialState();

        for (const player of Object.values(args.sessionState.players) as SessionPlayer[]) {
            player.teamId = null;
        }

        return {stateChanged: true, emittedEvents: []};
    }

    public applyAction(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        action: TeamGraffitiClientAction;
        context: { playerId: string; now: number };
    }): GameActionResult<"team-graffiti"> {
        accrueActionsForPlayer(args.sessionState.modeState, args.context.playerId, args.context.now);

        switch (args.action.type) {
            case "assign-team":
                return handleAssignTeam(args.sessionState, args.action.playerId, args.action.teamId);

            case "tag-house":
                return handleTagHouse(args.sessionState, args.context.playerId, args.action.houseId, args.context.now);


            case "start-team-round": {
                startRound(
                    args.sessionState,
                    args.action.durationSec,
                    this.config.teamGraffiti.initialActions,
                    args.context.now,
                );
                return {stateChanged: true, emittedEvents: []};
            }

            default:
                return {stateChanged: false, emittedEvents: []};
        }
    }

    public getNextTimerAt(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): number | null {
        const modeState = args.sessionState.modeState;

        if (args.now >= (modeState.roundEndsAt ?? 0)) {
            return null;
        }

        return computeNextAccrualTime(modeState);
    }

    public onTimerElapsed(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): GameActionResult<"team-graffiti"> {
        const modeState = args.sessionState.modeState;

        if (modeState.roundEndsAt && args.now >= modeState.roundEndsAt) {
            finalizeScores(modeState, modeState.roundEndsAt);
            return {stateChanged: true, emittedEvents: []};
        }

        const events = accrueAllActions(modeState, args.now);
        return {stateChanged: true, emittedEvents: events};
    }
}
