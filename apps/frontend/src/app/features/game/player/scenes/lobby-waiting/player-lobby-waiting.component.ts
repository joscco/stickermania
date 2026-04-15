import {Component, inject} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../../shared/icon/icon.component';
import {StickerPlayerService} from '../../../services/sticker-player.service';

@Component({
    selector: "app-player-lobby-waiting",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, IconComponent],
    templateUrl: "./player-lobby-waiting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerLobbyWaitingComponent {
    public readonly stickerService = inject(StickerPlayerService);
}
