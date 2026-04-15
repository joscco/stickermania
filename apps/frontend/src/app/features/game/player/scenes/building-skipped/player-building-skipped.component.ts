import {Component, inject} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../../shared/icon/icon.component';
import {StickerPlayerService} from '../../../services/sticker-player.service';

@Component({
    selector: "app-player-building-skipped",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, IconComponent],
    templateUrl: "./player-building-skipped.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingSkippedComponent {
    public readonly stickerService = inject(StickerPlayerService);
}

