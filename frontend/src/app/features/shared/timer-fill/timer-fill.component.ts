import {Component, input} from '@angular/core';

@Component({
  selector: 'app-timer-fill',
  standalone: true,
  imports: [],
  templateUrl: './timer-fill.component.html',
})
export class TimerFillComponent {
  readonly percent = input(0);
}
