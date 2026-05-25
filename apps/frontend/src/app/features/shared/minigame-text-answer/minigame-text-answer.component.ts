import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";

@Component({
  selector: "app-minigame-text-answer",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./minigame-text-answer.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-4 w-full px-4"},
})
export class MinigameTextAnswerComponent {
  readonly voteQuestion = input<string>("");
  readonly submitted = output<string>();

  answer = signal("");

  submit(): void {
    const a = this.answer().trim();
    if (!a) return;
    this.submitted.emit(a);
  }
}
