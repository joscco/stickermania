import { CommonModule } from "@angular/common";
import {Component, input, output, signal} from "@angular/core";
import {AnimPresenceDirective} from '../../../shared/animations/anim-on-init.directive';

@Component({
  selector: "app-board-setup-drawer",
  standalone: true,
  imports: [CommonModule, AnimPresenceDirective],
  templateUrl: "./board-setup-drawer.component.html"
})
export class BoardSetupDrawerComponent {
  public readonly isOpen = input<boolean>(false);
  public readonly canReset = input<boolean>(false);

  public readonly playerUrl = input<string>("");

  public readonly onCloseRequested = output();
  public readonly resetRequested = output();
  public readonly deleteRequested = output();

  public requestClose(): void {
    this.onCloseRequested.emit();
  }
}
