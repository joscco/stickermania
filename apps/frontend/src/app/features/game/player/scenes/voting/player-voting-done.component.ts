import {CommonModule} from "@angular/common";
import {Component, input, output} from "@angular/core";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../../shared/icon/icon.component';

@Component({
  selector: "app-player-voting-done",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, IconComponent],
  templateUrl: "./player-voting-done.component.html",
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingDoneComponent {
  public readonly allVotingDone = input<boolean>(false);
  public readonly endVotingEarly = output<void>();
}

