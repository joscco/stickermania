import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";

const LETTER_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä"],
  ["Y", "X", "C", "V", "B", "N", "M", "⌫"],
  ["123", " "],
];

const NUMBER_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["!", "?", ".", ",", "-", "+", "@", "#", "&", "%"],
  ["ABC", " ", "⌫"],
];

@Component({
  selector: "app-on-screen-keyboard",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./on-screen-keyboard.component.html",
})
export class OnScreenKeyboardComponent {
  public readonly maxLength = input<number>(80);
  public readonly value = input<string>("");
  public readonly valueChange = output<string>();

  public readonly numbersMode = signal(false);

  public currentRows(): string[][] {
    return this.numbersMode() ? NUMBER_ROWS : LETTER_ROWS;
  }

  public getKeyClass(key: string): string {
    const base = "flex items-center justify-center h-10 ";
    if (key === " ") return base + "flex-1 bg-white shadow-sm text-xs";
    if (key === "⌫" || key === "123" || key === "ABC") {
      return base + "min-w-[2.5rem] px-2 bg-stone-200 text-sm font-semibold";
    }
    return base + "min-w-[1.9rem] w-[calc((100%-30px)/11)] bg-white shadow-sm text-base";
  }

  public getKeyLabel(key: string): string {
    if (key === " ") return "Leer";
    return key;
  }

  public onKey(event: Event, key: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (key === "123") {
      this.numbersMode.set(true);
      return;
    }

    if (key === "ABC") {
      this.numbersMode.set(false);
      return;
    }

    const currentValue = this.value();

    if (key === "⌫") {
      if (currentValue.length > 0) {
        this.valueChange.emit(currentValue.slice(0, -1));
      }
      return;
    }

    // Normal character
    if (currentValue.length < this.maxLength()) {
      this.valueChange.emit(currentValue + key);
    }
  }
}

