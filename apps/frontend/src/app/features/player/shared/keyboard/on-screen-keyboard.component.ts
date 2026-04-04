import {Component, input, output, signal} from "@angular/core";

const UPPER_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö"],
  ["SHIFT", "Y", "X", "C", "V", "B", "N", "M", "Ä", "DEL"],
  ["#123", ",", "SPACE", ".", "!"],
];

const LOWER_ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö"],
  ["SHIFT", "y", "x", "c", "v", "b", "n", "m", "ä", "DEL"],
  ["#123", ",", "SPACE", ".", "!"],
];

const NUMBER_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", "#", "&", "%", "+", "-", "!", "?", "/"],
  ["(", ")", ",", ".", ":", ";", "'", "DEL"],
  ["ABC", ",", "SPACE", ".", "!"],
];

@Component({
  selector: "app-on-screen-keyboard",
  standalone: true,
  templateUrl: "./on-screen-keyboard.component.html",
})
export class OnScreenKeyboardComponent {
  public readonly maxLength = input<number>(80);
  public readonly value = input<string>("");
  public readonly valueChange = output<string>();

  public readonly numbersMode = signal(false);
  public readonly shifted = signal(true); // start uppercase

  /**
   * Guard against double-firing: on touch devices both touchstart AND
   * mousedown fire. We track whether a touch just happened and skip
   * the mousedown in that case.
   */
  private touchedAt = 0;

  /** Auto-repeat for DEL key when held */
  private deleteInterval: ReturnType<typeof setInterval> | null = null;
  private deleteTimeout: ReturnType<typeof setTimeout> | null = null;

  // ...existing code...

  public startDelete(event: Event): void {
    event.preventDefault();

    if (event.type === "touchstart") {
      this.touchedAt = Date.now();
    } else if (event.type === "mousedown" && Date.now() - this.touchedAt < 400) {
      return;
    }

    // Immediately delete one character
    this.doDelete();

    // After 400ms, start repeating every 75ms
    this.deleteTimeout = setTimeout(() => {
      this.deleteInterval = setInterval(() => this.doDelete(), 75);
    }, 400);
  }

  public stopDelete(): void {
    if (this.deleteTimeout) { clearTimeout(this.deleteTimeout); this.deleteTimeout = null; }
    if (this.deleteInterval) { clearInterval(this.deleteInterval); this.deleteInterval = null; }
  }

  private doDelete(): void {
    const current = this.value();
    if (current.length > 0) {
      this.valueChange.emit(current.slice(0, -1));
    }
  }

  public currentRows(): string[][] {
    if (this.numbersMode()) return NUMBER_ROWS;
    return this.shifted() ? UPPER_ROWS : LOWER_ROWS;
  }

  public isLetter(key: string): boolean {
    return key.length === 1 && /[a-zA-ZÄÖÜäöü]/.test(key);
  }

  public onKey(event: Event, key: string): void {
    event.preventDefault();

    if (key === "") return;

    // On touch devices, touchstart fires first, then mousedown follows.
    // Skip the mousedown if a touch just happened.
    if (event.type === "touchstart") {
      this.touchedAt = Date.now();
    } else if (event.type === "mousedown" && Date.now() - this.touchedAt < 400) {
      return;
    }

    if (key === "#123") {
      this.numbersMode.set(true);
      return;
    }
    if (key === "ABC") {
      this.numbersMode.set(false);
      return;
    }
    if (key === "SHIFT") {
      this.shifted.set(!this.shifted());
      return;
    }

    const current = this.value();

    if (key === "DEL") {
      if (current.length > 0) {
        this.valueChange.emit(current.slice(0, -1));
      }
      return;
    }

    if (key === "SPACE") {
      if (current.length < this.maxLength()) {
        this.valueChange.emit(current + " ");
      }
      return;
    }

    if (current.length < this.maxLength()) {
      this.valueChange.emit(current + key);
      // Auto-lowercase after first character (like a real keyboard)
      if (this.shifted()) {
        this.shifted.set(false);
      }
    }
  }
}
