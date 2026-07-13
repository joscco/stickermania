import type {ClientKind, ClientToServerMessage, ServerToClientMessage} from "@birthday/shared";
import type {SessionService} from "../session-management/sessionService.js";

export type ConnectedPlayerSocket = {
    sessionId: string;
    clientId: string;
    kind: ClientKind;
    playerId: string;
};

export async function handlePlayerSocketAction(args: {
    message: ClientToServerMessage;
    connectedClient: ConnectedPlayerSocket;
    sessionService: SessionService;
    sendToClient: (message: ServerToClientMessage) => void;
}): Promise<void> {
    const {message, connectedClient, sessionService, sendToClient} = args;

    switch (message.type) {
        case "submit-user-data":
            await sessionService.saveUserData(connectedClient.sessionId, connectedClient.playerId, message.name, message.avatarDataUrl);
            return;

        case "start-game-session":
            await sessionService.startGameSession(connectedClient.sessionId);
            return;

        case "reset-session":
            await sessionService.resetSession(connectedClient.sessionId);
            return;

        case "game-action":
            await sessionService.handleGameAction({
                sessionId: connectedClient.sessionId,
                clientId: connectedClient.clientId,
                playerId: connectedClient.playerId,
                clientKind: connectedClient.kind,
                message,
            });
            return;

        case "ping":
            sendToClient({type: "pong", t: message.t, serverTime: Date.now()});
            return;

        case "join":
        default:
            sendToClient({type: "error", message: "Nicht unterstützte Nachricht."});
    }
}
