import {Component, inject} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {StickerPlayerService} from '../../../services/sticker-player.service';

@Component({
    selector: "app-player-building-submitted",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective],
    templateUrl: "./player-building-submitted.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingSubmittedComponent {
    public readonly stickerService = inject(StickerPlayerService);
}

