import type {SessionPlayer, SessionState} from "@birthday/shared";
import type {ConnectedClientSession} from "../session/sessionRuntimeTypes.js";

export interface GameActionResult {
    stateChanged: boolean;
    emittedEvents: import("@birthday/shared").PartyGameServerEvent[];
}

export interface GameEngine {
    createInitialState(): import("@birthday/shared").PartyGameState;

    onPlayerJoined(args: {
        sessionState: SessionState;
        player: SessionPlayer;
        connectedClient: ConnectedClientSession;
        now: number;
    }): GameActionResult;

    startGame(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult;

    resetGame(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult;

    applyAction(args: {
        sessionState: SessionState;
        action: import("@birthday/shared").GameClientAction;
        context: {sessionId: string; playerId: string; clientId: string; clientKind: import("@birthday/shared").ClientKind; now: number};
    }): GameActionResult;

    getNextTimerAt(args: {
        sessionState: SessionState;
        now: number;
    }): number | null;

    onTimerElapsed(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult;
}