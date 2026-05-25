import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";

@Component({
  selector: "app-minigame-number",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-number.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-6 p-6"},
})
export class MinigameNumberComponent {
  readonly min = input(1);
  readonly max = input(100);
  readonly default = input(50);
  readonly submitted = output<number>();

  value = signal(this.default());

  onSlider(e: Event): void {
    this.value.set(Number((e.target as HTMLInputElement).value));
  }

  onNumberInput(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (!isNaN(v)) this.value.set(Math.max(this.min(), Math.min(this.max(), Math.round(v))));
  }

  increment(): void { this.value.set(Math.min(this.max(), this.value() + 1)); }
  decrement(): void { this.value.set(Math.max(this.min(), this.value() - 1)); }

  submit(): void {
    this.submitted.emit(this.value());
  }
}
