import {Component, effect, input, output, signal} from "@angular/core";
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

  value = signal(0);

  constructor() {
    effect(() => {
      this.value.set(this.clamp(this.default()));
    });
  }

  onSlider(e: Event): void {
    this.value.set(this.clamp(Number((e.target as HTMLInputElement).value)));
  }

  increment(): void {
    this.value.update(v => this.clamp(v + 1));
  }

  decrement(): void {
    this.value.update(v => this.clamp(v - 1))
  }

  submit(): void {
    this.submitted.emit(this.value());
  }

  private clamp(v: number): number {
    return Math.max(Math.min(v, this.min()), Math.min(v, this.max()));
  }
}
