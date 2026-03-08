import type {ClientKind, GameClientActionMap, GameModeId, GameServerEventMap, SessionPlayer, SessionState,} from "@birthday/shared";
import {ConnectedClientSession} from "../session/sessionRuntimeTypes.js";

export interface GameActionContext {
    sessionId: string;
    playerId: string;
    clientId: string;
    clientKind: ClientKind;
    now: number;
}

export interface GameActionResult<TMode extends GameModeId> {
    stateChanged: boolean;
    emittedEvents: GameServerEventMap[TMode][];
}

export interface GameModeEngine<TMode extends GameModeId, TModeState> {
    readonly mode: TMode;

    createInitialState(): TModeState;

    onPlayerJoined(args: {
        sessionState: SessionState<TModeState>;
        player: SessionPlayer;
        connectedClient: ConnectedClientSession;
        now: number;
    }): GameActionResult<TMode>;

    onPlayerLeft?(args: {
        sessionState: SessionState<TModeState>;
        playerId: string;
        clientId: string;
        now: number;
    }): GameActionResult<TMode>;

    startMode(args: {
        sessionState: SessionState<TModeState>;
        now: number;
    }): GameActionResult<TMode>;

    resetMode(args: {
        sessionState: SessionState<TModeState>;
        now: number;
    }): GameActionResult<TMode>;

    applyAction(args: {
        sessionState: SessionState<TModeState>;
        action: GameClientActionMap[TMode];
        context: GameActionContext;
    }): Promise<GameActionResult<TMode>> | GameActionResult<TMode>;

    getNextTimerAt?(args: {
        sessionState: SessionState<TModeState>;
        now: number;
    }): number | null;

    onTimerElapsed?(args: {
        sessionState: SessionState<TModeState>;
        now: number;
    }): Promise<GameActionResult<TMode>> | GameActionResult<TMode>;
}