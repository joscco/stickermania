import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";

@Component({
  selector: "app-minigame-thesis",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-thesis.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-5 w-full px-4"},
})
export class MinigameThesisComponent {
  readonly title = input<string>("");
  readonly submitted = output<{agreed: boolean; estimatedPercent: number}>();

  agreed = signal<boolean | null>(null);
  estimatedPercent = signal(50);

  submit(): void {
    if (this.agreed() === null) return;
    this.submitted.emit({
      agreed: this.agreed()!,
      estimatedPercent: this.estimatedPercent(),
    });
  }

  agree() { this.agreed.set(true); }
  disagree() { this.agreed.set(false); }
}
