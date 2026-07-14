import {CommonModule} from "@angular/common";
import {Component, ElementRef, ViewChild, effect, input, output, signal} from "@angular/core";

import {capturePointer, releasePointer} from "../../../../../shared/input/pointer-event-utils";
import {SvgComponent} from "../../../../../shared/ui/svg/svg.component";
import {
  PAINT_COLORS,
  PAINT_TEXT_ALIGNMENTS,
  PAINT_TEXT_VERTICAL_ALIGNMENTS,
  type PaintTextAlign,
  type PaintTextVerticalAlign,
} from "../shared/sticker-creator-types";
import {
  type ActivePaintTextBoxOverlay,
  type PaintTextResizeHandle,
  type PaintTextStyleUpdate,
} from "./paint-text-box.controller";

export type PaintTextEditorSettings = {
  color: (typeof PAINT_COLORS)[number];
  fontSize: number;
  lineHeight: number;
  align: PaintTextAlign;
  verticalAlign: PaintTextVerticalAlign;
};

export type PaintTextResizeDelta = {
  handle: PaintTextResizeHandle;
  deltaClientX: number;
  deltaClientY: number;
};

type PaintTextResizeState = {
  handle: PaintTextResizeHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  target: HTMLElement | null;
};

@Component({
  selector: "app-sticker-creator-paint-text-editor",
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: "./sticker-creator-paint-text-editor.component.html",
})
export class StickerCreatorPaintTextEditorComponent {
  readonly textBox = input.required<ActivePaintTextBoxOverlay>();
  readonly active = input(false);
  readonly menuVisible = input(false);
  readonly settings = input.required<PaintTextEditorSettings>();

  readonly textChanged = output<string>();
  readonly styleChanged = output<PaintTextStyleUpdate>();
  readonly deleteRequested = output<void>();
  readonly resizeDelta = output<PaintTextResizeDelta>();
  readonly resizeEnded = output<void>();

  readonly editing = signal(false);
  readonly paintColors = PAINT_COLORS;
  readonly paintTextAlignments = PAINT_TEXT_ALIGNMENTS;
  readonly paintTextVerticalAlignments = PAINT_TEXT_VERTICAL_ALIGNMENTS;
  readonly fontSizeMin = 8;
  readonly fontSizeMax = 400;
  readonly lineHeightMin = 0.8;
  readonly lineHeightMax = 2;

  private textAreaElement: HTMLTextAreaElement | null = null;
  private resizeState: PaintTextResizeState | null = null;

  @ViewChild("paintTextArea") set paintTextAreaRef(ref: ElementRef<HTMLTextAreaElement> | undefined) {
    this.textAreaElement = ref?.nativeElement ?? null;
    if (ref && this.editing()) {
      this.focusTextArea();
    }
  }

  constructor() {
    effect(() => {
      if (!this.active()) {
        this.cancelInteraction();
      }
    });
  }

  startEditing(): void {
    if (!this.active()) return;
    this.editing.set(true);
    this.focusTextArea();
  }

  stopEditing(): void {
    this.editing.set(false);
  }

  cancelInteraction(): void {
    this.stopEditing();
    const state = this.resizeState;
    if (state?.target) {
      releasePointer(state.target, state.pointerId);
    }
    this.resizeState = null;
  }

  requestDelete(): void {
    this.stopEditing();
    this.deleteRequested.emit();
  }

  updateFontSize(size: number): void {
    this.styleChanged.emit({fontSize: Math.max(1, Math.round(size))});
  }

  updateLineHeight(lineHeight: number): void {
    const normalized = Math.max(this.lineHeightMin, Math.min(this.lineHeightMax, lineHeight));
    this.styleChanged.emit({lineHeight: normalized});
  }

  textAlignLabel(align: PaintTextAlign): string {
    return align === "left" ? "links" : align === "center" ? "zentriert" : "rechts";
  }

  textVerticalAlignLabel(align: PaintTextVerticalAlign): string {
    return align === "top" ? "oben" : align === "middle" ? "mittig" : "unten";
  }

  startResize(event: PointerEvent, handle: PaintTextResizeHandle): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement | null;
    this.resizeState = {
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      target,
    };

    if (target) {
      capturePointer(target, event.pointerId);
    }
  }

  continueResize(event: PointerEvent): void {
    const state = this.resizeState;
    if (!state || state.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.resizeDelta.emit({
      handle: state.handle,
      deltaClientX: event.clientX - state.startClientX,
      deltaClientY: event.clientY - state.startClientY,
    });
    this.resizeState = {
      ...state,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  finishResize(event: PointerEvent): void {
    const state = this.resizeState;
    if (!state || state.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (state.target) {
      releasePointer(state.target, event.pointerId);
    }

    this.resizeState = null;
    this.resizeEnded.emit();
  }

  private focusTextArea(): void {
    setTimeout(() => {
      const textArea = this.textAreaElement;
      if (!textArea || !this.active() || !this.editing()) return;
      textArea.focus();
      textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    });
  }
}
