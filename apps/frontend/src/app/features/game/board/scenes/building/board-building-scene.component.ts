import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, StickerCollageGameState, SessionPlayer, StickerPack, StickerCollageBuildingState} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardPlayerAvatarComponent, type PlayerAvatarStatus} from '../../player-avatar/board-player-avatar.component';

@Component({
    selector: "app-board-building-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, BoardPlayerAvatarComponent],
    templateUrl: "./board-building-scene.component.html",
})
export class BoardBuildingSceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly gameState = input<StickerCollageGameState | null>(null);

    private get buildingPs(): StickerCollageBuildingState | null {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "BUILDING" ? ps : null;
    }

    /** All players participating in this round (persists across disconnects) */
    public readonly roundParticipants = computed<SessionPlayer[]>(() => {
        const ms = this.gameState();
        const players = this.worldStore.players();
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

    public readonly guaranteedPack = computed<StickerPack | null>(() => {
        const ms = this.gameState();
        if (!ms?.guaranteedPackId) return null;
        return ms.stickerPacks.find(p => p.id === ms.guaranteedPackId) ?? null;
    });

    public readonly submissionCount = computed(() => {
        const ms = this.gameState();
        if (!ms) return 0;
        return (ms.submissions[ms.currentRoundIndex] ?? []).length;
    });

    public playerStatus(playerId: string): PlayerAvatarStatus {
        if (this.isOffline(playerId))    return "offline";
        if (this.hasSubmitted(playerId)) return "submitted";
        if (this.isDrawing(playerId))    return "drawing";
        if (this.buildingPs?.skippedPlayerIds.includes(playerId)) return "skipped";
        return "idle";
    }

    private isOffline(playerId: string): boolean {
        return !(this.worldStore.players()[playerId]?.connected ?? false);
    }

    private isDrawing(playerId: string): boolean {
        const ps = this.buildingPs;
        if (!ps) return false;
        return !!ps.playerHands[playerId] && !this.hasSubmitted(playerId);
    }

    private hasSubmitted(playerId: string): boolean {
        const ms = this.gameState();
        if (!ms) return false;
        return (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    }

    public endRoundEarly(): void {
        const action: StickerCollageClientAction = {type: "end-round-early"};
        this.wsService.send({type: "game-action", action});
    }
}
