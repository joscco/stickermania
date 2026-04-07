import {Component} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-player-disconnected",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective],
    templateUrl: "./player-disconnected.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerDisconnectedComponent {}
