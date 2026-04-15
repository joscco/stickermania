import { Component, input } from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../shared/icon/icon.component';

@Component({
  selector: "app-lobby-ready",
  standalone: true,
  imports: [AnimOnInitDirective, AnimGroupDirective, IconComponent],
  templateUrl: './lobby-ready.component.html',
})
export class LobbyReadyComponent {
  public readonly playerName = input.required<string>();
}
