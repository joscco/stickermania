import {Component, input, output} from '@angular/core';
import {CountdownBarComponent} from '../../../shared/countdown-bar/countdown-bar.component';
import {AnimPresenceDirective} from '../../../shared/animations/anim-on-init.directive';
import {PlayerHeaderViewModel} from '../player-view-models';

@Component({
    selector: 'app-player-header',
    standalone: true,
  imports: [CountdownBarComponent, AnimPresenceDirective],
    templateUrl: './player-header.component.html',
})
export class PlayerHeaderComponent {
    readonly vm = input.required<PlayerHeaderViewModel>();
    readonly timerEndsAt = input<number>(0);
    readonly timerTotalSec = input<number>(0);
    readonly editName = output<void>();
    readonly editAvatar = output<void>();
}
