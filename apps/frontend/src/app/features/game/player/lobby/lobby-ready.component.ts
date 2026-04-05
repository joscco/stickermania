import { Component, input } from "@angular/core";

@Component({
  selector: "app-lobby-ready",
  standalone: true,
  templateUrl: './lobby-ready.component.html',
})
export class LobbyReadyComponent {
  public readonly playerName = input.required<string>();
}
