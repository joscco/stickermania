import { Component, input } from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../shared/svg/svg.component';

@Component({
  selector: "app-lobby-ready",
  standalone: true,
  imports: [AnimOnInitDirective, AnimGroupDirective, SvgComponent],
  templateUrl: './lobby-ready.component.html',
})
export class LobbyReadyComponent {
  public readonly playerName = input.required<string>();
}
