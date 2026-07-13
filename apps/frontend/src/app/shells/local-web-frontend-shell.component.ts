import {Component} from "@angular/core";
import {PlayerComponent} from "../features/player/player-shell/player.component";

@Component({
  selector: "app-local-web-frontend-shell",
  standalone: true,
  imports: [PlayerComponent],
  templateUrl: "./local-web-frontend-shell.component.html",
})
export class LocalWebFrontendShellComponent {}
