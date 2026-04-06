import {Component, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerLobbyComponent} from './scenes/lobby/player-lobby.component';
import {PlayerBuildingComponent} from './scenes/building/player-building.component';
import {PlayerVotingComponent} from './scenes/voting/player-voting.component';
import {PlayerResultsComponent} from './scenes/results/player-results.component';
import {PlayerNextRoundComponent} from './scenes/next-round/player-next-round.component';

@Component({
    selector: "app-sticker-player-view",
    standalone: true,
    imports: [
        CommonModule,
        PlayerLobbyComponent,
        PlayerBuildingComponent,
        PlayerVotingComponent,
        PlayerResultsComponent,
        PlayerNextRoundComponent,
    ],
    templateUrl: "./sticker-player-view.component.html",
})
export class StickerPlayerViewComponent {
    public readonly stickerService = inject(StickerPlayerService);
}
