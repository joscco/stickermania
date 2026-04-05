import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../core/world.store";
import type {StickerCollageModeState} from "@birthday/shared";
import {BoardLobbySceneComponent} from "./board-lobby/board-lobby-scene.component";
import {BoardBuildingSceneComponent} from "./board-building/board-building-scene.component";
import {BoardVotingSceneComponent} from "./board-voting/board-voting-scene.component";
import {BoardResultsSceneComponent} from "./board-results/board-results-scene.component";

@Component({
    selector: "app-sticker-board-scene",
    standalone: true,
    imports: [CommonModule, BoardLobbySceneComponent, BoardBuildingSceneComponent, BoardVotingSceneComponent, BoardResultsSceneComponent],
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
