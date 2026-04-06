import {inject, Injectable, computed} from "@angular/core";
import type {StickerCollageClientAction, StickerCollageModeState, StickerCollage, StickerHand, StickerPlacement, StickerPack} from "@birthday/shared";
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {WebSocketService} from '../../../core/websocket.service';

@Injectable()
export class StickerPlayerService {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    // ─── Computed state ──────────────────────────────────────────

    public readonly currentPrompt = computed(() => this.modeState()?.currentPrompt ?? "");
    public readonly currentRoundIndex = computed(() => this.modeState()?.currentRoundIndex ?? 0);
    public readonly phase = computed(() => this.modeState()?.phase ?? "LOBBY");
    public readonly roundEndsAt = computed(() => this.modeState()?.roundEndsAt ?? 0);
    public readonly votingEndsAt = computed(() => this.modeState()?.votingEndsAt ?? 0);
    public readonly resultsEndsAt = computed(() => this.modeState()?.resultsEndsAt ?? 0);
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

    public readonly skippedPlayerIds = computed<string[]>(() =>
        this.modeState()?.skippedPlayerIds ?? []
    );

    public readonly hasSkippedThisRound = computed<boolean>(() => {
        const playerId = this.sessionStore.playerId();
        return !!playerId && this.skippedPlayerIds().includes(playerId);
    });

    /**
     * True when every connected player has either submitted or skipped.
     * Used to show the "Runde schließen" button on the player building screen.
     */
    public readonly allPlayersDone = computed<boolean>(() => {
        const ms = this.modeState();
        const players = this.worldStore.players();
        if (!ms || ms.phase !== 'BUILDING') return false;
        const connectedIds = Object.values(players)
            .filter(p => p.connected)
            .map(p => p.id);
        if (connectedIds.length === 0) {
          return false;
        }
        const roundSubs = ms.submissions[ms.currentRoundIndex] ?? [];
        const submittedIds = new Set(roundSubs.map(s => s.playerId));
        const skippedIds = new Set(ms.skippedPlayerIds);
        return connectedIds.every(id => submittedIds.has(id) || skippedIds.has(id));
    });

    /** Submissions for the current round (used for voting in VOTING phase) */
    public readonly currentRoundSubmissions = computed<StickerCollage[]>(() => {
        const ms = this.modeState();
        if (!ms) return [];
        return ms.submissions[ms.currentRoundIndex] ?? [];
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

    // ─── Winner / results ────────────────────────────────────────

    public readonly winnerId = computed(() => this.modeState()?.winnerId ?? null);

    public readonly isWinner = computed(() => {
        const playerId = this.sessionStore.playerId();
        return !!playerId && playerId === this.winnerId();
    });

    public readonly promptChoices = computed(() => this.modeState()?.promptChoices ?? []);
    public readonly packUnlockChoices = computed<StickerPack[]>(() => {
        const ms = this.modeState();
        if (!ms) return [];
        return ms.packUnlockChoices
            .map(id => ms.stickerPacks.find(p => p.id === id))
            .filter((p): p is StickerPack => !!p);
    });
    public readonly guaranteedPackChoices = computed<StickerPack[]>(() => {
        const ms = this.modeState();
        if (!ms) return [];
        return ms.guaranteedPackChoices
            .map(id => ms.stickerPacks.find(p => p.id === id))
            .filter((p): p is StickerPack => !!p);
    });
    public readonly winnerChoicesDone = computed(() => this.modeState()?.winnerChoicesDone ?? false);

    /** Whether the winner has already chosen a prompt */
    public readonly hasChosenPrompt = computed(() => {
        const ms = this.modeState();
        if (!ms) return false;
        return !!ms.promptHistory[ms.currentRoundIndex + 1];
    });

    /** Whether the winner has already unlocked a pack */
    public readonly hasUnlockedPack = computed(() => {
        return !!this.modeState()?.lastUnlockedPackId;
    });

    /** Whether there are any locked packs left to unlock */
    public readonly hasLockedPacks = computed(() => {
        return (this.modeState()?.packUnlockChoices ?? []).length > 0;
    });

    /** My placement in last vote results (1-indexed, null if not found) */
    public readonly myPlacement = computed<number | null>(() => {
        const playerId = this.sessionStore.playerId();
        const results = this.lastVoteResults();
        if (!playerId || results.length === 0) return null;
        const idx = results.findIndex(r => r.playerId === playerId);
        return idx >= 0 ? idx + 1 : null;
    });

    // ─── Sticker packs ──────────────────────────────────────────

    public readonly stickerPacks = computed(() => this.modeState()?.stickerPacks ?? []);
    public readonly unlockedPackIds = computed(() => this.modeState()?.unlockedPackIds ?? []);
    public readonly lastUnlockedPackId = computed(() => this.modeState()?.lastUnlockedPackId ?? null);
    public readonly guaranteedPackId = computed(() => this.modeState()?.guaranteedPackId ?? null);

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

    public skipRound(): void {
        this.sendAction({type: "skip-round"});
    }

    public castVote(collageId: string): void {
        this.sendAction({type: "cast-vote", collageId});
    }

    public startGame(): void {
        this.sendAction({type: "start-game"});
    }

    public endRoundEarly(): void {
        this.sendAction({type: "end-round-early"});
    }

    public endVotingEarly(): void {
        this.sendAction({type: "end-voting-early"});
    }

    public pickPrompt(prompt: string): void {
        this.sendAction({type: "pick-prompt", prompt});
    }

    public unlockPack(packId: string): void {
        this.sendAction({type: "unlock-pack", packId});
    }

    public pickGuaranteedPack(packId: string): void {
        this.sendAction({type: "pick-guaranteed-pack", packId});
    }

    public advanceFromResults(): void {
        this.sendAction({type: "advance-from-results"});
    }

    private sendAction(action: StickerCollageClientAction): void {
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
