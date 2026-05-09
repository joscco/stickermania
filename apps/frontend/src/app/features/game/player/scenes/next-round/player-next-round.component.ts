import {Component, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-next-round",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, SvgComponent],
    templateUrl: "./player-next-round.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerNextRoundComponent {
    public readonly hasNewPack = input<boolean>(false);
}