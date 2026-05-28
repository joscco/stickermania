import {Component, input, output} from '@angular/core';
import {PlayerHeaderViewModel} from '../player-view-models';
import {CountdownBarComponent} from '../../../shared/countdown-bar/countdown-bar.component';

@Component({
    selector: 'app-player-header',
    standalone: true,
  imports: [CountdownBarComponent],
    templateUrl: './player-header.component.html',
})
export class PlayerHeaderComponent {
    readonly vm = input.required<PlayerHeaderViewModel>();
    readonly timerPercent = input(100);
    readonly timeLeft = input('');
    readonly editName = output<void>();
    readonly editAvatar = output<void>();
}
