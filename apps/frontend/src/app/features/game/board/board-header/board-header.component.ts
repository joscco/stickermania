import {Component, input, output} from '@angular/core';
import {AnimPresenceDirective} from '../../../shared/animations/anim-on-init.directive';
import {CountdownBarComponent} from '../../../shared/countdown-bar/countdown-bar.component';
import {BoardHeaderViewModel} from '../board-view-models';

@Component({
    selector: 'app-board-header',
    standalone: true,
  imports: [CountdownBarComponent, AnimPresenceDirective],
    templateUrl: './board-header.component.html',
})
export class BoardHeaderComponent {
    readonly vm = input.required<BoardHeaderViewModel>();
    readonly timerEndsAt = input<number>(0);
    readonly timerTotalSec = input<number>(0);
    readonly backToLobby = output<void>();
    readonly openSettings = output<void>();
}
