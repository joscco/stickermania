import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerLobbyComponent} from './scenes/lobby/player-lobby.component';
import {PlayerBuildingComponent} from './scenes/building/player-building.component';
import {PlayerVotingComponent} from './scenes/voting/player-voting.component';
import {PlayerResultsComponent} from './scenes/results/player-results.component';
import {PlayerNextRoundComponent} from './scenes/next-round/player-next-round.component';
import {PlayerScreen} from './player-screen.enum';

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
    public readonly PlayerScreen = PlayerScreen;

    public readonly activeScreen = computed<PlayerScreen>(() => {
        switch (this.stickerService.phase()) {
            case 'LOBBY':            return PlayerScreen.LOBBY_WAITING;
            case 'BUILDING': {
                if (this.stickerService.hasSubmittedThisRound()) return PlayerScreen.BUILDING_SUBMITTED;
                // No hand yet → auto-request, show building canvas immediately
                // (requestHand is idempotent on the server)
                if (!this.stickerService.myHand()) {
                    this.stickerService.requestHand();
                    return PlayerScreen.BUILDING;
                }
                return PlayerScreen.BUILDING;
            }
            case 'VOTING':           return PlayerScreen.VOTING;
            case 'RESULTS':          return PlayerScreen.RESULTS;
            case 'NEXT_ROUND_SETUP': return PlayerScreen.NEXT_ROUND;
            default:                 return PlayerScreen.LOBBY_WAITING;
        }
    });
}
