import {Component} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-disconnected",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, SvgComponent],
    templateUrl: "./player-disconnected.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerDisconnectedComponent {}
