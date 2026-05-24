import {Component, input, output} from '@angular/core';
import {PlayerHeaderViewModel} from '../player-view-models';

@Component({
    selector: 'app-player-header',
    standalone: true,
  imports: [],
    templateUrl: './player-header.component.html',
})
export class PlayerHeaderComponent {
    readonly vm = input.required<PlayerHeaderViewModel>();
    readonly timerPercent = input(100);
    readonly timeLeft = input('');
    readonly editName = output<void>();
    readonly editAvatar = output<void>();
}
