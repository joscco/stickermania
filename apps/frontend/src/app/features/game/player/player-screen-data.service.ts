import {inject, Injectable, computed, signal} from '@angular/core';
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {WebSocketService} from '../../../core/websocket.service';
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerScreen} from './player-screen.enum';
import type {
    VotingViewModel,
    VotingVariant,
    BuildingViewModel,
    BuildingSubmittedViewModel,
    BuildingSkippedViewModel,
    VotingDoneViewModel,
    ResultsViewModel,
    WinnerStep,
    NextRoundViewModel,
    PlayerHeaderViewModel,
} from './player-view-models';
import type {MinigameTask, MinigameSubmission} from '@birthday/shared';

@Injectable()
export class PlayerScreenDataService {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly stickerService = inject(StickerPlayerService);
    private readonly timerService = inject(PlayerTimerService);

    public readonly isEditingName = signal(false);
    public readonly isEditingAvatar = signal(false);

    public readonly isNameSet = computed(() => this.sessionStore.playerName().trim().length > 0);

    public readonly hasAvatar = computed(() => {
        const id = this.sessionStore.playerId();
        return id ? !!this.worldStore.players()[id]?.avatarUrl : false;
    });

    public readonly existingAvatarImage = computed(() => {
        const id = this.sessionStore.playerId();
        return id ? (this.worldStore.players()[id]?.avatarUrl ?? null) : null;
    });

    public readonly baseScreen = computed<PlayerScreen>(() => {
        const wsStatus = this.wsService.status();
        if (wsStatus === 'idle' || wsStatus === 'connecting') {
            return this.wsService.wasConnected() ? PlayerScreen.RECONNECTING : PlayerScreen.CONNECTING;
        }
        if (wsStatus === 'disconnected') return PlayerScreen.DISCONNECTED;
        if (!this.isNameSet() || this.isEditingName()) return PlayerScreen.LOBBY_NAME;
        if (this.isEditingAvatar()) return PlayerScreen.LOBBY_AVATAR;
        if (!this.isReady()) return PlayerScreen.CONNECTING;
        if (!this.hasAvatar()) return PlayerScreen.LOBBY_AVATAR;

        const phase = this.worldStore.stickerCollageGameState()?.phaseState.phase ?? 'LOBBY';
        switch (phase) {
            case 'LOBBY':            return PlayerScreen.LOBBY_WAITING;
            case 'BUILDING': {
                if (this.stickerService.hasSubmittedThisRound()) return PlayerScreen.BUILDING_SUBMITTED;
                if (this.stickerService.hasSkippedThisRound()) return PlayerScreen.BUILDING_SKIPPED;
                return PlayerScreen.BUILDING;
            }
            case 'VOTING': {
                if (this.stickerService.myDoneVoting()) {
                    if (this.stickerService.allVotingDone()) return PlayerScreen.VOTING_ALL_DONE;
                    return PlayerScreen.VOTING_DONE;
                }
                return PlayerScreen.VOTING;
            }
            case 'RESULTS':          return PlayerScreen.RESULTS;
            case 'NEXT_ROUND_SETUP': return PlayerScreen.NEXT_ROUND;
            default:                 return PlayerScreen.LOBBY_WAITING;
        }
    });

    private readonly isReady = computed(() => {
        const state = this.worldStore.sessionState();
        if (!state) return false;
        const playerId = this.sessionStore.playerId();
        if (!playerId) return false;
        return !!state.players[playerId];
    });

    public readonly headerVm = computed<PlayerHeaderViewModel>(() => ({
        playerName: this.sessionStore.playerName(),
        avatarUrl: this.existingAvatarImage(),
        timeLeft: this.timerService.timeLeft(),
        showEditControls: this.isNameSet() && this.hasAvatar(),
    }));

    readonly timerPercentElapsed = computed(() => this.timerService.percentElapsed());
    readonly timerPercentLeft = computed(() => this.timerService.percentLeft());
    readonly timerTimeLeft = computed(() => this.timerService.timeLeft());
    readonly timerActive = computed(() => {
        const phase = this.stickerService.phase();
        return phase === 'BUILDING' || phase === 'VOTING';
    });
    readonly showTimerNotifications = computed(() => {
        return this.timerActive() && !this.stickerService.hasSubmittedThisRound() && !this.stickerService.hasSkippedThisRound();
    });
    readonly timerNotification = computed(() => this.timerService.notification());
    readonly timerTimeUp = computed(() => this.timerService.timeUp() && this.showTimerNotifications());

    public readonly votingVm = computed<VotingViewModel>(() => {
        const gameState = this.stickerService.gameState();
        const votingState = gameState?.phaseState;
        const variant: VotingVariant = (() => {
            if (!votingState || votingState.phase !== 'VOTING') return 'active';
            if (this.stickerService.allVotingDone()) return 'all-done';
            if (this.stickerService.myDoneVoting()) return 'done';
            return 'active';
        })();

        return {
            variant,
            prompt: this.stickerService.currentPrompt(),
            submissions: this.stickerService.currentRoundSubmissions(),
            stickerCatalog: this.stickerService.stickerCatalog(),
            myVotes: this.stickerService.myVotes(),
            votesRemaining: this.stickerService.votesPerPlayer() - this.stickerService.myVotes().length,
            players: this.worldStore.players(),
            myPlayerId: this.sessionStore.playerId() ?? '',
            currentTask: this.stickerService.currentTask(),
            minigameSubmissions: this.stickerService.currentRoundMinigameSubmissions(),
        };
    });

    public readonly buildingVm = computed<BuildingViewModel>(() => ({
        roundIndex: this.stickerService.currentRoundIndex(),
        prompt: this.stickerService.currentPrompt(),
        task: this.stickerService.currentTask(),
        unlockedStickers: this.stickerService.unlockedStickers(),
        stickerCatalog: this.stickerService.stickerCatalog(),
        stickerPacks: this.stickerService.stickerPacks(),
        unlockedPackIds: this.stickerService.unlockedPackIds(),
        recommendedPackIds: this.stickerService.currentRecommendedPackIds(),
        maxStickersOnCanvas: this.stickerService.maxStickersOnCanvas(),
    }));

    public readonly lobbyWaitingVm = computed(() => ({
        connectedPlayers: Object.values(this.worldStore.players()).filter(p => p.connected),
    }));

    public readonly buildingSubmittedVm = computed<BuildingSubmittedViewModel>(() => {
        const gs = this.stickerService.gameState();
        const ri = this.stickerService.currentRoundIndex();
        const collageIds = new Set((gs?.submissions?.[ri] ?? []).map(s => s.playerId));
        const minigameIds = new Set((gs?.minigameSubmissions?.[ri] ?? []).map(s => s.playerId));
        return {
            allPlayersDone: this.stickerService.allPlayersDone(),
            players: this.worldStore.players(),
            roundParticipantIds: gs?.roundParticipantIds ?? [],
            submittedPlayerIds: new Set([...collageIds, ...minigameIds]),
        };
    });

    public readonly buildingSkippedVm = computed<BuildingSkippedViewModel>(() => {
        const gs = this.stickerService.gameState();
        const ri = this.stickerService.currentRoundIndex();
        const collageIds = new Set((gs?.submissions?.[ri] ?? []).map(s => s.playerId));
        const minigameIds = new Set((gs?.minigameSubmissions?.[ri] ?? []).map(s => s.playerId));
        return {
            allPlayersDone: this.stickerService.allPlayersDone(),
            players: this.worldStore.players(),
            roundParticipantIds: gs?.roundParticipantIds ?? [],
            submittedPlayerIds: new Set([...collageIds, ...minigameIds]),
        };
    });

    public readonly votingDoneVm = computed<VotingDoneViewModel>(() => {
        const gameState = this.stickerService.gameState();
        const vs = gameState?.phaseState;
        return {
            allVotingDone: this.stickerService.allVotingDone(),
            players: this.worldStore.players(),
            roundParticipantIds: gameState?.roundParticipantIds ?? [],
            doneVotingIds: (vs?.phase === 'VOTING' ? vs.doneVotingIds : []),
        };
    });

    public readonly resultsVm = computed<ResultsViewModel>(() => {
        const stickerService = this.stickerService;
        const winnerId = stickerService.winnerId();
        const myResult = stickerService.lastVoteResults().find(r => r.playerId === (this.sessionStore.playerId() ?? ''));
        const task = stickerService.currentTask();
        const myId = this.sessionStore.playerId() ?? '';
        const minigames = stickerService.currentRoundMinigameSubmissions();

        return {
            myPlacement: stickerService.myPlacement(),
            myVoteCount: myResult?.voteCount ?? 0,
            isWinner: stickerService.isWinner(),
            isTiedWinner: stickerService.isTiedWinner(),
            winnerId,
            winnerName: winnerId ? (this.worldStore.players()[winnerId]?.name ?? 'Gewinner') : '',
            lastVoteResults: stickerService.lastVoteResults(),
            currentTask: task,
            resultSummary: computeResultSummary(task, minigames, myId),
        };
    });

    public readonly nextRoundVm = computed<NextRoundViewModel>(() => ({
        hasNewPack: !!this.stickerService.lastUnlockedPackId(),
    }));
}

function computeResultSummary(task: MinigameTask | null, submissions: MinigameSubmission[], myId: string): string {
    if (!task) return "Abstimmungsergebnis";
    const my = submissions.find(s => s.playerId === myId);

    switch (task.type) {
        case "thesis": {
            const th = my as any;
            if (!th) return "Keine Teilnahme";
            const total = submissions.length;
            const agreedCount = submissions.filter(s => s.type === "thesis" && (s as any).agreed).length;
            const actualPct = total > 0 ? Math.round((agreedCount / total) * 100) : 50;
            return `Du hast ${th.agreed ? "zugestimmt" : "abgelehnt"} und ${th.estimatedPercent}% geschätzt. Tatsächlich: ${actualPct}%. Abweichung: ${Math.abs(th.estimatedPercent - actualPct)}%`;
        }
        case "number": {
            const num = my as any;
            if (!num) return "Keine Teilnahme";
            const values = submissions.filter(s => s.type === "number").map(s => (s as any).value as number);
            const avg = values.length > 0 ? Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length) : 0;
            return `Deine Zahl: ${num.value}. Durchschnitt: ${avg}. Abweichung: ${Math.abs(num.value - avg)}`;
        }
        case "timer-stop": {
            const t = my as any;
            if (!t) return "Keine Teilnahme";
            const target = (task as any).targetSec ?? 5;
            return `Du hast bei ${t.elapsedSec.toFixed(2)}s gestoppt. Ziel: ${target}s. Abweichung: ${Math.abs(t.elapsedSec - target).toFixed(2)}s`;
        }
        case "shape-split": {
            const sp = my as any;
            if (!sp) return "Keine Teilnahme";
            const target = (task as any).targetFraction ?? 0.5;
            const myPct = Math.round(sp.areaFraction * 100);
            const targetPct = Math.round(target * 100);
            return `Du hast ${myPct}:${100 - myPct} geteilt. Ziel: ${targetPct}:${100 - targetPct}. Abweichung: ${Math.abs(sp.areaFraction - target).toFixed(2)}`;
        }
        case "sticker-place":
            return "Platzierung nach Abstand zum Durchschnitt";
        case "choice":
            return "Die beliebteste Wahl gewinnt";
        case "drawing":
            return my ? "Abstimmungsergebnis" : "Keine Teilnahme";
        case "text-answer":
            return my ? "Abstimmungsergebnis" : "Keine Teilnahme";
        default:
            return "";
    }
}
