import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";

@Component({
  selector: "sm-big-percentage-slider",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./big-percentage-slider.component.html",
  host: {class: "block w-full"},
})
export class BigPercentageSliderComponent {
  public readonly value = input(0.5);
  public readonly valueChange = output<number>();

  public readonly percentage = computed(() => {
    const rawPercentage = this.value() * 100;
    return Math.round(Math.max(0, Math.min(100, rawPercentage)));
  });

  public readonly handleLeft = computed(() => {
    return `${this.percentage()}%`;
  });

  private isDragging = false;

  public beginDrag(pointerEvent: PointerEvent, trackElement: HTMLElement): void {
    pointerEvent.preventDefault();

    this.isDragging = true;

    const sliderElement = pointerEvent.currentTarget as HTMLElement;
    sliderElement.setPointerCapture(pointerEvent.pointerId);

    this.setFromClientX(pointerEvent.clientX, trackElement);
  }

  public continueDrag(pointerEvent: PointerEvent, trackElement: HTMLElement): void {
    if (!this.isDragging) {
      return;
    }

    pointerEvent.preventDefault();
    this.setFromClientX(pointerEvent.clientX, trackElement);
  }

  public endDrag(pointerEvent: PointerEvent): void {
    this.isDragging = false;

    const sliderElement = pointerEvent.currentTarget as HTMLElement;

    if (sliderElement.hasPointerCapture(pointerEvent.pointerId)) {
      sliderElement.releasePointerCapture(pointerEvent.pointerId);
    }
  }

  public changeWithKeyboard(keyboardEvent: KeyboardEvent): void {
    const currentPercentage = this.percentage();

    if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowDown") {
      keyboardEvent.preventDefault();
      this.setPercentage(currentPercentage - 1);
      return;
    }

    if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowUp") {
      keyboardEvent.preventDefault();
      this.setPercentage(currentPercentage + 1);
      return;
    }

    if (keyboardEvent.key === "Home") {
      keyboardEvent.preventDefault();
      this.setPercentage(0);
      return;
    }

    if (keyboardEvent.key === "End") {
      keyboardEvent.preventDefault();
      this.setPercentage(100);
    }
  }

  private setFromClientX(clientX: number, trackElement: HTMLElement): void {
    const trackRectangle = trackElement.getBoundingClientRect();
    const pointerOffset = clientX - trackRectangle.left;
    const rawPercentage = (pointerOffset / trackRectangle.width) * 100;

    this.setPercentage(rawPercentage);
  }

  private setPercentage(rawPercentage: number): void {
    const clampedPercentage = Math.max(0, Math.min(100, rawPercentage));
    const roundedPercentage = Math.round(clampedPercentage);

    this.valueChange.emit(roundedPercentage / 100);
  }
}