import {inject, Injectable, computed} from "@angular/core";
import type {StickerCollageClientAction, StickerCollageModeState, StickerCollage, StickerHand, StickerPlacement} from "@birthday/shared";
import {GameSessionStore} from "../../../core/challenge.store";
import {WorldStore} from "../../../core/world.store";
import {WebSocketService} from "../../../core/websocket.service";

/**
 * Service for sticker-collage player interactions.
 */
@Injectable()
export class StickerPlayerService {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    public readonly currentPrompt = computed(() => this.modeState()?.currentPrompt ?? "");
    public readonly currentRoundIndex = computed(() => this.modeState()?.currentRoundIndex ?? 0);
    public readonly phase = computed(() => this.modeState()?.phase ?? "BUILDING");
    public readonly roundEndsAt = computed(() => this.modeState()?.roundEndsAt ?? 0);
    public readonly stickerCatalog = computed(() => this.modeState()?.stickerCatalog ?? []);

    public readonly myHand = computed<StickerHand | null>(() => {
        const playerId = this.sessionStore.playerId();
        if (!playerId) return null;
        return this.modeState()?.playerHands[playerId] ?? null;
    });

    public readonly hasSubmittedThisRound = computed<boolean>(() => {
        const playerId = this.sessionStore.playerId();
        const ms = this.modeState();
        if (!playerId || !ms) return false;
        const roundSubs = ms.submissions[ms.currentRoundIndex] ?? [];
        return roundSubs.some(s => s.playerId === playerId);
    });

    /** Submissions from the PREVIOUS round (for voting) */
    public readonly previousRoundSubmissions = computed<StickerCollage[]>(() => {
        const ms = this.modeState();
        if (!ms || ms.currentRoundIndex < 2) return [];
        return ms.submissions[ms.currentRoundIndex - 1] ?? [];
    });

    /** Current player's votes this round */
    public readonly myVotes = computed<string[]>(() => {
        const playerId = this.sessionStore.playerId();
        if (!playerId) return [];
        return this.modeState()?.currentVotes[playerId] ?? [];
    });

    public readonly lastVoteResults = computed(() => this.modeState()?.lastVoteResults ?? []);

    public readonly votesPerPlayer = computed(() => this.modeState()?.votesPerPlayer ?? 3);
    public readonly maxStickersOnCanvas = computed(() => this.modeState()?.maxStickersOnCanvas ?? 12);

    // ─── Actions ─────────────────────────────────────────────────

    public requestHand(): void {
        this.sendAction({type: "request-hand"});
    }

    public swapSticker(handIndex: number, newStickerId: string): void {
        this.sendAction({type: "swap-sticker", handIndex, newStickerId});
    }

    public submitCollage(placements: StickerPlacement[]): void {
        this.sendAction({type: "submit-collage", placements});
    }

    public castVote(collageId: string): void {
        this.sendAction({type: "cast-vote", collageId});
    }

    public startRound(): void {
        this.sendAction({type: "start-round"});
    }

    private sendAction(action: StickerCollageClientAction): void {
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}

