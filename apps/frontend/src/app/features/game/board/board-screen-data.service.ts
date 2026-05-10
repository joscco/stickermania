import {inject, Injectable, computed, signal} from '@angular/core';
import type {SessionPlayer} from '@birthday/shared';
import {WorldStore} from '../../../core/world.store';
import type {BoardHeaderViewModel} from './board-view-models';

@Injectable()
export class BoardScreenDataService {
    private readonly worldStore = inject(WorldStore);

    readonly gameState = computed(() => this.worldStore.stickerCollageGameState());
    readonly basePhase = computed(() => this.gameState()?.phaseState.phase ?? 'LOBBY');
    readonly players = computed(() => this.worldStore.players());
    readonly connectedPlayers = computed<SessionPlayer[]>(() =>
        Object.values(this.worldStore.players()).filter(p => p.connected)
    );

    readonly timeLeft = signal('');
    readonly isSetupDrawerOpen = signal(false);

    private readonly currentTimerEndsAt = computed(() => {
        const ps = this.worldStore.stickerCollageGameState()?.phaseState;
        if (!ps) return 0;
        if (ps.phase === 'BUILDING') return ps.roundEndsAt;
        if (ps.phase === 'VOTING') return ps.votingEndsAt;
        if (ps.phase === 'RESULTS') return ps.resultsEndsAt;
        return 0;
    });

    private timerInterval: ReturnType<typeof setInterval> | null = null;

    readonly headerVm = computed<BoardHeaderViewModel>(() => ({
        hasSession: !!this.worldStore.sessionState(),
        timeLeft: this.timeLeft(),
    }));

    startTimerTick(): void {
        this.stopTimerTick();
        this.timerInterval = setInterval(() => {
            const endsAt = this.currentTimerEndsAt();
            if (endsAt <= 0) {
                this.timeLeft.set('');
                return;
            }
            const remainingMilliseconds = Math.max(0, endsAt - Date.now());
            const totalSeconds = Math.ceil(remainingMilliseconds / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            this.timeLeft.set(`${minutes}:${String(seconds).padStart(2, '0')}`);
        }, 500);
    }

    stopTimerTick(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.timeLeft.set('');
    }

    toggleSetupDrawer(): void {
        this.isSetupDrawerOpen.update(v => !v);
    }

    closeSetupDrawer(): void {
        this.isSetupDrawerOpen.set(false);
    }
}