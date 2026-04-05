import {Component, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {StickerVotingComponent} from '../../voting/sticker-voting.component';
import {WorldStore} from '../../../../../core/world.store';
import {GameSessionStore} from '../../../../../core/challenge.store';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-player-voting",
    standalone: true,
    imports: [CommonModule, StickerVotingComponent, AnimOnInitDirective],
    templateUrl: "./player-voting.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingComponent {
    public readonly stickerService = inject(StickerPlayerService);
    public readonly worldStore = inject(WorldStore);
    public readonly sessionStore = inject(GameSessionStore);
}

