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
    ResultsViewModel,
    WinnerStep,
    NextRoundViewModel,
    PlayerHeaderViewModel,
} from './player-view-models';

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

    readonly timerEndsAt = computed(() => this.timerService.endsAt());
    readonly timerTotalSec = computed(() => this.timerService.totalDurationSec());

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
        };
    });

    public readonly buildingVm = computed<BuildingViewModel>(() => ({
        roundIndex: this.stickerService.currentRoundIndex(),
        prompt: this.stickerService.currentPrompt(),
        myHand: this.stickerService.myHand() ?? null,
        stickerCatalog: this.stickerService.stickerCatalog(),
        stickerPacks: this.stickerService.stickerPacks(),
        maxStickersOnCanvas: this.stickerService.maxStickersOnCanvas(),
    }));

    public readonly buildingSubmittedVm = computed<BuildingSubmittedViewModel>(() => ({
        allPlayersDone: this.stickerService.allPlayersDone(),
    }));

    public readonly buildingSkippedVm = computed<BuildingSkippedViewModel>(() => ({
        allPlayersDone: this.stickerService.allPlayersDone(),
    }));

    public readonly resultsVm = computed<ResultsViewModel>(() => {
        const stickerService = this.stickerService;
        const isWinner = stickerService.isWinner();
        const winnerChoicesDone = stickerService.winnerChoicesDone();
        const hasChosenPrompt = stickerService.hasChosenPrompt();
        const hasLockedPacks = stickerService.hasLockedPacks();
        const hasUnlockedPack = stickerService.hasUnlockedPack();
        const promptChoices = stickerService.promptChoices();
        const packUnlockChoices = stickerService.packUnlockChoices();

        let currentWinnerStep: WinnerStep = null;
        if (isWinner && !winnerChoicesDone) {
            if (!hasChosenPrompt && promptChoices.length > 0) {
                currentWinnerStep = 'prompt';
            } else if (hasChosenPrompt && !hasUnlockedPack && packUnlockChoices.length > 0) {
                currentWinnerStep = 'unlock';
            } else if (hasChosenPrompt && (hasUnlockedPack || !hasLockedPacks) && stickerService.guaranteedPackChoices().length > 0) {
                currentWinnerStep = 'guaranteed';
            }
        }

const winnerId = stickerService.winnerId();
        const myResult = stickerService.lastVoteResults().find(r => r.playerId === (this.sessionStore.playerId() ?? ''));
        return {
            myPlacement: stickerService.myPlacement(),
            myVoteCount: myResult?.voteCount ?? 0,
            isWinner,
            winnerChoicesDone,
            currentWinnerStep,
            hasChosenPrompt,
            hasLockedPacks,
            hasUnlockedPack,
            promptChoices,
            packUnlockChoices,
            guaranteedPackChoices: stickerService.guaranteedPackChoices(),
            winnerId,
            winnerName: winnerId ? (this.worldStore.players()[winnerId]?.name ?? 'Der Gewinner') : '',
            canReadyToAdvance: stickerService.canReadyToAdvance(),
        };
    });

    public readonly nextRoundVm = computed<NextRoundViewModel>(() => ({
        hasNewPack: !!this.stickerService.lastUnlockedPackId(),
    }));
}