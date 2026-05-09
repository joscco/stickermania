import {Component, input, output} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-building-skipped",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, SvgComponent],
    templateUrl: "./player-building-skipped.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingSkippedComponent {
    public readonly allPlayersDone = input<boolean>(false);
    public readonly endRoundEarly = output<void>();
}