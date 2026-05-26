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

    readonly currentTimerEndsAt = computed(() => {
        const ps = this.worldStore.stickerCollageGameState()?.phaseState;
        if (!ps) {
          return 0;
        }
        if (ps.phase === 'BUILDING') {
          return ps.roundEndsAt;
        }
        if (ps.phase === 'VOTING') {
          return ps.votingEndsAt;
        }
        if (ps.phase === 'RESULTS') {
          return ps.resultsEndsAt;
        }
        return 0;
    });

    readonly currentTimerTotalSec = signal(0);

    private readonly _tick = signal(0);
    private readonly _phaseStartClientMs = signal(0);

    readonly timerPercentElapsed = computed(() => {
        this._tick();
        const totalSeconds = this.currentTimerTotalSec();
        if (!totalSeconds) return 0;
        const elapsedMs = Date.now() - this._phaseStartClientMs();
        return Math.min(100, Math.max(0, (elapsedMs / (totalSeconds * 1000)) * 100));
    });

    readonly timerActive = computed(() => 'BUILDING,VOTING'.includes(this.basePhase()));

    private timerInterval: ReturnType<typeof setInterval> | null = null;

    readonly headerVm = computed<BoardHeaderViewModel>(() => ({
        hasSession: !!this.worldStore.sessionState(),
        timeLeft: this.timeLeft(),
    }));

    startTimerTick(): void {
        this.stopTimerTick();

        let lastEndsAt = 0;

        this.timerInterval = setInterval(() => {
            const endsAt = this.currentTimerEndsAt();
            if (endsAt <= 0) {
                this.timeLeft.set('');
                this.currentTimerTotalSec.set(0);
                return;
            }

            if (endsAt !== lastEndsAt) {
                const gameState = this.worldStore.stickerCollageGameState();
                const phase = gameState?.phaseState.phase;
                let totalSec = 0;
                if (phase === 'BUILDING') {
                    totalSec = gameState?.roundStartedAt
                        ? Math.ceil((endsAt - gameState.roundStartedAt) / 1000)
                        : (gameState?.roundDurationSec || 0);
                } else if (phase === 'VOTING') {
                    totalSec = gameState?.votingDurationSec ?? 0;
                } else if (phase === 'RESULTS') {
                    totalSec = gameState?.resultsDurationSec ?? 0;
                }
                this.currentTimerTotalSec.set(totalSec);
                this._phaseStartClientMs.set(Date.now());
                lastEndsAt = endsAt;
            }

            this._tick.update(v => v + 1);

            const remaining = Math.max(0, endsAt - Date.now());
            const s = Math.ceil(remaining / 1000);
            const min = Math.floor(s / 60);
            const sec = s % 60;
            this.timeLeft.set(`${min}:${String(sec).padStart(2, '0')}`);
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
