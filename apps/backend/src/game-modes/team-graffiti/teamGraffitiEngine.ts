import type {
    GameConfig,
    SessionPlayer,
    SessionState,
    TeamGraffitiClientAction,
    TeamGraffitiHouse,
    TeamGraffitiHouseType,
    TeamGraffitiModeState,
    TeamGraffitiPlayerActions,
    TeamGraffitiTeamId,
} from "@birthday/shared";
import {GameActionResult, GameModeEngine} from "../gameModeEngine.js";

/** Logical city scene dimensions. */
const SCENE_WIDTH = 2000;
const SCENE_HEIGHT = 1400;

/**
 * Pre-defined house layout.
 * Houses are scattered across the city with organic placement.
 */
interface HouseDef {
    houseType: TeamGraffitiHouseType;
    x: number;
    y: number;
    flipped: boolean;
}

/** Simple deterministic pseudo-random based on seed. */
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s >>> 0) / 0x7fffffff;
    };
}

function generateHouseLayout(): HouseDef[] {
    const rng = seededRandom(42);
    const types: TeamGraffitiHouseType[] = ["A", "B", "C"];
    const houses: HouseDef[] = [];

    // Place ~24 houses via Poisson-disc-like placement with min distance
    const minDist = 220;
    const margin = 160;
    const attempts = 200;

    for (let i = 0; i < attempts && houses.length < 24; i++) {
        const x = Math.round(margin + rng() * (SCENE_WIDTH - 2 * margin));
        const y = Math.round(margin + rng() * (SCENE_HEIGHT - 2 * margin));

        // Check distance to all existing houses
        let tooClose = false;
        for (const h of houses) {
            const dx = h.x - x;
            const dy = h.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        houses.push({
            houseType: types[houses.length % types.length],
            x,
            y,
            flipped: rng() > 0.5,
        });
    }

    return houses;
}

const HOUSE_LAYOUT = generateHouseLayout();

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

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    public startMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): GameActionResult<"team-graffiti"> {
        const modeState = args.sessionState.modeState;
        const durationSec = this.config.teamGraffiti.roundDurationSec;

        modeState.roundStartedAt = args.now;
        modeState.roundEndsAt = args.now + durationSec * 1000;

        // Grant initial actions to all players
        for (const playerId of Object.keys(args.sessionState.players)) {
            if (!modeState.playerActions[playerId]) {
                modeState.playerActions[playerId] = {
                    actions: 0,
                    lastAccrualAt: args.now,
                };
            }
            modeState.playerActions[playerId].actions = this.config.teamGraffiti.initialActions;
            modeState.playerActions[playerId].lastAccrualAt = args.now;
        }

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    public resetMode(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
    }): GameActionResult<"team-graffiti"> {
        args.sessionState.modeState = this.createInitialState();

        for (const player of Object.values(args.sessionState.players) as SessionPlayer[]) {
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
        // Before handling action, accrue actions for this player
        this.accrueActionsForPlayer(args.sessionState.modeState, args.context.playerId, args.context.now);

        switch (args.action.type) {
            case "assign-team":
                return this.handleAssignTeam(args.sessionState, args.action.playerId, args.action.teamId);

            case "tag-house":
                return this.handleTagHouse(args.sessionState, args.context.playerId, args.action.houseId, args.context.now);

            case "wipe-house":
                return this.handleWipeHouse(args.sessionState, args.context.playerId, args.action.houseId, args.context.now);

            case "start-team-round": {
                const modeState = args.sessionState.modeState;
                modeState.roundStartedAt = args.context.now;
                modeState.roundEndsAt = args.context.now + args.action.durationSec * 1000;

                for (const playerId of Object.keys(args.sessionState.players)) {
                    if (!modeState.playerActions[playerId]) {
                        modeState.playerActions[playerId] = {actions: 0, lastAccrualAt: args.context.now};
                    }
                    modeState.playerActions[playerId].actions = this.config.teamGraffiti.initialActions;
                    modeState.playerActions[playerId].lastAccrualAt = args.context.now;
                }

                return {stateChanged: true, emittedEvents: []};
            }

            default:
                return {stateChanged: false, emittedEvents: []};
        }
    }

    // ── Timer-based action accrual ──────────────────────────────

    public getNextTimerAt(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): number | null {
        const modeState = args.sessionState.modeState;

        if (!modeState.roundStartedAt || !modeState.roundEndsAt) {
            return null;
        }

        if (args.now >= modeState.roundEndsAt) {
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

    public onTimerElapsed(args: {
        sessionState: SessionState<TeamGraffitiModeState>;
        now: number;
    }): GameActionResult<"team-graffiti"> {
        const modeState = args.sessionState.modeState;
        const events: GameActionResult<"team-graffiti">["emittedEvents"] = [];

        // If round ended, finalize scores
        if (modeState.roundEndsAt && args.now >= modeState.roundEndsAt) {
            this.finalizeScores(modeState, modeState.roundEndsAt);
            return {stateChanged: true, emittedEvents: events};
        }

        // Accrue actions for all players
        const intervalMs = modeState.actionAccrualIntervalSec * 1000;

        for (const [playerId, pa] of Object.entries(modeState.playerActions) as [string, TeamGraffitiPlayerActions][]) {
            if (pa.actions >= modeState.maxActions) continue;

            while (pa.lastAccrualAt + intervalMs <= args.now && pa.actions < modeState.maxActions) {
                pa.actions += 1;
                pa.lastAccrualAt += intervalMs;
            }

            events.push({
                type: "actions-updated",
                playerId,
                actions: pa.actions,
            });
        }

        return {stateChanged: true, emittedEvents: events};
    }

    // ── Handlers ────────────────────────────────────────────────

    private handleAssignTeam(
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

    private handleTagHouse(
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

        // If the other team owned it, finalize their score
        if (house.owner && house.ownedSince) {
            const heldSeconds = Math.max(0, Math.floor((now - house.ownedSince) / 1000));
            modeState.teams[house.owner].score += heldSeconds;
        }

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

    private handleWipeHouse(
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

        // Finalize score for the owning team
        if (house.ownedSince) {
            const heldSeconds = Math.max(0, Math.floor((now - house.ownedSince) / 1000));
            modeState.teams[house.owner].score += heldSeconds;
        }

        playerActions.actions -= 1;

        const previousOwner = house.owner;
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

    // ── Helpers ──────────────────────────────────────────────────

    private accrueActionsForPlayer(modeState: TeamGraffitiModeState, playerId: string, now: number): void {
        if (!modeState.roundStartedAt) return;

        const pa = modeState.playerActions[playerId];
        if (!pa) return;

        const intervalMs = modeState.actionAccrualIntervalSec * 1000;
        while (pa.lastAccrualAt + intervalMs <= now && pa.actions < modeState.maxActions) {
            pa.actions += 1;
            pa.lastAccrualAt += intervalMs;
        }
    }

    private finalizeScores(modeState: TeamGraffitiModeState, endTime: number): void {
        for (const house of Object.values(modeState.houses) as TeamGraffitiHouse[]) {
            if (house.owner && house.ownedSince) {
                const heldSeconds = Math.max(0, Math.floor((endTime - house.ownedSince) / 1000));
                modeState.teams[house.owner].score += heldSeconds;
                house.ownedSince = endTime;
            }
        }
    }
}

