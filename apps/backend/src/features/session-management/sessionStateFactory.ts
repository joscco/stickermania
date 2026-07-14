import type {GameConfig, SessionPlayer, SessionState} from "@stickermania/shared";
import type {StickerCollageGame} from "../sticker-management/stickerCollageGame.js";

export class SessionStateFactory {
    public constructor(
        private readonly config: GameConfig,
        private readonly stickerCollageGame: StickerCollageGame,
    ) {}

    public createEmptySession(args: {
        sessionId: string;
        sessionCode: string;
        now?: number;
    }): SessionState {
        const now = args.now ?? Date.now();

        return {
            sessionId: args.sessionId,
            sessionCode: args.sessionCode,
            players: {},
            gameState: this.stickerCollageGame.createInitialState(),
            revision: 0,
            updatedAt: now,
            createdAt: now,
            // expire after the configured retention window
            expiresAt: now + this.config.sessionTtlHours * 60 * 60 * 1000,
        };
    }

    public createPlayer(args: {
        playerId: string;
        now?: number;
        isHost: boolean;
    }): SessionPlayer {
        const now = args.now ?? Date.now();

        return {
            id: args.playerId,
            name: "",
            avatarUrl: null,
            avatarAssetPath: null,
            score: 0,
            joinedAt: now,
            connected: true,
            isHost: args.isHost,
            teamId: null,
        };
    }
}
