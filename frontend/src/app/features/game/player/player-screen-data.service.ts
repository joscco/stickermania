import {computed, inject, Injectable, signal} from '@angular/core';
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {WebSocketService} from '../../../core/websocket.service';
import {PartyPlayerService} from '../services/party-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerScreen} from './player-screen.enum';
import type {BuildingSkippedViewModel, BuildingSubmittedViewModel, BuildingViewModel, PlayerHeaderViewModel, ResultsViewModel,} from './player-view-models';
import type {MinigameTask, OpenMinigameSubmission, RoundVoteResult} from '@birthday/shared';

@Injectable()
export class PlayerScreenDataService {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly partyService = inject(PartyPlayerService);
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

        const phase = this.worldStore.partyGameState()?.phaseState.phase ?? 'LOBBY';
        switch (phase) {
            case 'LOBBY':            return PlayerScreen.LOBBY_WAITING;
            case 'ROUND_ACTIVE': {
                if (this.partyService.hasSubmittedThisRound()) return PlayerScreen.ROUND_SUBMITTED;
                if (this.partyService.hasSkippedThisRound()) return PlayerScreen.ROUND_SKIPPED;
                return PlayerScreen.ROUND_ACTIVE;
            }
            case 'ROUND_RESULTS':    return PlayerScreen.ROUND_RESULTS;
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
        const phase = this.partyService.phase();
        return phase === 'ROUND_ACTIVE';
    });
    readonly showTimerNotifications = computed(() => {
        return this.timerActive() && !this.partyService.hasSubmittedThisRound() && !this.partyService.hasSkippedThisRound();
    });
    readonly timerNotification = computed(() => this.timerService.notification());
    readonly timerTimeUp = computed(() => this.timerService.timeUp() && this.showTimerNotifications());

    public readonly buildingVm = computed<BuildingViewModel>(() => ({
        roundIndex: this.partyService.currentRoundIndex(),
        prompt: this.partyService.currentPrompt(),
        task: this.partyService.currentTask(),
    }));

    public readonly lobbyWaitingVm = computed(() => ({
        connectedPlayers: Object.values(this.worldStore.players()).filter(p => p.connected),
    }));

    public readonly buildingSubmittedVm = computed<BuildingSubmittedViewModel>(() => {
        const gs = this.partyService.gameState();
        const ri = this.partyService.currentRoundIndex();
        const submissionIds = new Set((gs?.submissions?.[ri] ?? []).map(s => s.playerId));
        const minigameIds = new Set((gs?.minigameSubmissions?.[ri] ?? []).map(s => s.playerId));
        return {
            allPlayersDone: this.partyService.allPlayersDone(),
            players: this.worldStore.players(),
            roundParticipantIds: gs?.roundParticipantIds ?? [],
            submittedPlayerIds: new Set([...submissionIds, ...minigameIds]),
        };
    });

    public readonly buildingSkippedVm = computed<BuildingSkippedViewModel>(() => {
        const gs = this.partyService.gameState();
        const ri = this.partyService.currentRoundIndex();
        const submissionIds = new Set((gs?.submissions?.[ri] ?? []).map(s => s.playerId));
        const minigameIds = new Set((gs?.minigameSubmissions?.[ri] ?? []).map(s => s.playerId));
        return {
            allPlayersDone: this.partyService.allPlayersDone(),
            players: this.worldStore.players(),
            roundParticipantIds: gs?.roundParticipantIds ?? [],
            submittedPlayerIds: new Set([...submissionIds, ...minigameIds]),
        };
    });

    public readonly resultsVm = computed<ResultsViewModel>(() => {
        const partyService = this.partyService;
        const winnerId = partyService.winnerId();
        const myResult = partyService.lastResults().find(r => r.playerId === (this.sessionStore.playerId() ?? ''));
        const task = partyService.currentTask();
        const myId = this.sessionStore.playerId() ?? '';
        const minigames = partyService.currentRoundMinigameSubmissions();
        const myMinigameSubmission = minigames.find(s => s.playerId === myId) ?? null;

        return {
            myPlacement: partyService.myPlacement(),
            myVoteCount: myResult?.voteCount ?? 0,
            isWinner: partyService.isWinner(),
            isTiedWinner: partyService.isTiedWinner(),
            winnerId,
            winnerName: winnerId ? (this.worldStore.players()[winnerId]?.name ?? 'Gewinner') : '',
            lastResults: partyService.lastResults(),
            currentTask: task,
            myPlayerId: myId,
            myMinigameSubmission,
            myMinigameResult: myResult ?? null,
            resultSummary: computeResultSummary(task, minigames, myId, myResult),
        };
    });
}

function computeResultSummary(
    task: MinigameTask | null,
    submissions: OpenMinigameSubmission[],
    myId: string,
    myResult: RoundVoteResult | undefined,
): string {
    if (!task) return "Abstimmungsergebnis";
    const my = submissions.find(s => s.playerId === myId);
    if (task.type === "timer-stop" && my && myResult?.result) {
        const result = myResult.result as {stoppedAtSeconds?: number; deviationSeconds?: number};
        if (typeof result.stoppedAtSeconds === "number" && typeof result.deviationSeconds === "number") {
            return `${result.stoppedAtSeconds.toFixed(2)}s gestoppt, ${result.deviationSeconds.toFixed(2)}s neben dem Ziel.`;
        }
    }
    return "";
}
