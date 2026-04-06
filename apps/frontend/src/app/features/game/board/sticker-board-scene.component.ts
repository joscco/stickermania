import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageModeState} from "@birthday/shared";
import {BoardLobbySceneComponent} from './scenes/lobby/board-lobby-scene.component';
import {BoardBuildingSceneComponent} from './scenes/building/board-building-scene.component';
import {BoardVotingSceneComponent} from './scenes/voting/board-voting-scene.component';
import {BoardResultsSceneComponent} from './scenes/results/board-results-scene.component';
import {WorldStore} from '../../../core/world.store';
import {BoardQrPanelComponent} from './qr-panel/board-qr-panel.component';
import {AnimGroupDirective, AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-sticker-board-scene",
    standalone: true,
  imports: [CommonModule, BoardLobbySceneComponent, BoardBuildingSceneComponent, BoardVotingSceneComponent, BoardResultsSceneComponent, BoardQrPanelComponent, AnimGroupDirective, AnimOnInitDirective],
    templateUrl: "./sticker-board-scene.component.html",
})
export class StickerBoardSceneComponent {
    private readonly worldStore = inject(WorldStore);

    public readonly sessionCode = input<string | null>(null);
    public readonly playerQrDataUrl = input<string | null>(null);
    public readonly wifiQrDataUrl = input<string | null>(null);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    public readonly phase = computed(() => this.modeState()?.phase ?? "LOBBY");
}
