import {Component, computed, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageGameState, SessionPlayer, StickerPack, StickerCollageBuildingState} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {RoundInfoComponent} from '../../../../shared/round-info/round-info.component';
import {BoardPlayerAvatarComponent, type PlayerAvatarStatus} from '../../player-avatar/board-player-avatar.component';

@Component({
    selector: "app-board-building-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, RoundInfoComponent, BoardPlayerAvatarComponent],
    templateUrl: "./board-building-scene.component.html",
})
export class BoardBuildingSceneComponent {
    public readonly gameState = input<StickerCollageGameState | null>(null);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly endRoundEarly = output<void>();

    private get buildingPs(): StickerCollageBuildingState | null {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "BUILDING" ? ps : null;
    }

    public readonly roundParticipants = computed<SessionPlayer[]>(() => {
        const ms = this.gameState();
        const players = this.players();
        if (!ms || ms.phaseState.phase === "LOBBY") {
            return Object.values(players).filter(p => p.connected);
        }
        return ms.roundParticipantIds
            .map(id => players[id])
            .filter((p): p is SessionPlayer => !!p);
    });

    public readonly lastUnlockedPack = computed<StickerPack | null>(() => {
        const ms = this.gameState();
        const lastId = ms?.phaseState.phase === "RESULTS" ? ms.phaseState.lastUnlockedPackId : null;
        if (!lastId) return null;
        return ms!.stickerPacks.find(p => p.id === lastId) ?? null;
    });

    public readonly submissionCount = computed(() => {
        const ms = this.gameState();
        if (!ms) return 0;
        return (ms.submissions[ms.currentRoundIndex] ?? []).length;
    });

    public readonly playerStatus = (playerId: string): PlayerAvatarStatus => {
        if (!this.players()[playerId]?.connected) return 'offline';
        if (this.hasSubmitted(playerId)) return 'submitted';
        if (this.buildingPs?.skippedPlayerIds.includes(playerId)) return 'skipped';
        return 'drawing';
    };

    private hasSubmitted(playerId: string): boolean {
        const ms = this.gameState();
        if (!ms) return false;
        return (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    }
}