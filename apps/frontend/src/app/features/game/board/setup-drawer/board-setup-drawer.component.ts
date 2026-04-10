import { CommonModule } from "@angular/common";
import {Component, input, output, signal} from "@angular/core";

@Component({
  selector: "app-board-setup-drawer",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./board-setup-drawer.component.html"
})
export class BoardSetupDrawerComponent {
  public readonly isOpen = input<boolean>(false);
  public readonly canReset = input<boolean>(false);

  public readonly playerUrl = input<string>("");

  public readonly onCloseRequested = output();
  public readonly resetRequested = output();
  public readonly deleteRequested = output();

  public readonly copyHint = signal<string | null>(null);

  public requestClose(): void {
    this.onCloseRequested.emit();
  }
}
