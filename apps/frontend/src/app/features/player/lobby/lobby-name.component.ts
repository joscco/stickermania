import { Component, output, signal } from "@angular/core";

@Component({
  selector: "app-lobby-name",
  standalone: true,
  templateUrl: './lobby-name.component.html',
})
export class LobbyNameComponent {
  public readonly nameInput = signal("");
  public readonly nameSubmitted = output<string>();

  public submit(): void {
    const name = this.nameInput().trim();
    if (name.length > 0) {
      this.nameSubmitted.emit(name);
    }
  }
}
