import { Component, input } from "@angular/core";

@Component({
  selector: "app-idle-search-waiting",
  standalone: true,
  templateUrl: './idle-search-waiting.component.html',
})
export class IdleSearchWaitingComponent {
  public readonly timeLeft = input<string>("");
}
