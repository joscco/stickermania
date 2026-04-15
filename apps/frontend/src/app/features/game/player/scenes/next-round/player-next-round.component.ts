import {Component, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../../shared/icon/icon.component';

@Component({
    selector: "app-player-next-round",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, IconComponent],
    templateUrl: "./player-next-round.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerNextRoundComponent {
    public readonly stickerService = inject(StickerPlayerService);
}

