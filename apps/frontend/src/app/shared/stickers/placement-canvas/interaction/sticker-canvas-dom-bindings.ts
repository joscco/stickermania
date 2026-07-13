import type {StickerGestureHandler} from "./sticker-gesture-handler";
import {installCanvasInputListeners} from "./sticker-canvas-input";
import {installSafariGestureGuards} from "../../../input/pointer-event-utils";

export type StickerCanvasDomBindingsOptions = {
  canvasElement: HTMLDivElement;
  inputElement?: HTMLElement | null;
  gesture: StickerGestureHandler;
  syncGesture: () => void;
  inputBlocked: () => boolean;
  coalescePointerMoves?: () => boolean;
  hasSelection: () => boolean;
  clearSelection: () => void;
  setCanvasSize: (width: number, height: number) => void;
  updateViewportBounds: () => void;
};

export class StickerCanvasDomBindings {
  private removeInputListeners: (() => void) | null = null;
  private removeGestureGuards: (() => void) | null = null;
  private removeOutsideListener: (() => void) | null = null;
  private removeViewportListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly options: StickerCanvasDomBindingsOptions) {}

  install(): void {
    this.installResizeObserver();
    this.installGestureGuards();
    this.installInputListeners();
    this.installOutsideSelectionListener();
    this.installViewportListeners();
    this.options.updateViewportBounds();
  }

  destroy(): void {
    this.removeInputListeners?.();
    this.removeGestureGuards?.();
    this.removeOutsideListener?.();
    this.removeViewportListener?.();
    this.resizeObserver?.disconnect();
  }

  private installResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.options.setCanvasSize(entry.contentRect.width, entry.contentRect.height);
      this.options.updateViewportBounds();
    });
    this.resizeObserver.observe(this.options.canvasElement);
  }

  private installInputListeners(): void {
    this.removeInputListeners = installCanvasInputListeners(
      this.inputElement(),
      this.options.gesture,
      this.options.syncGesture,
      this.options.inputBlocked,
      {coalescePointerMoves: this.options.coalescePointerMoves?.() ?? false},
    );
  }

  private installGestureGuards(): void {
    this.removeGestureGuards = installSafariGestureGuards(this.inputElement());
  }

  private installOutsideSelectionListener(): void {
    const onOutside = (event: PointerEvent) => {
      if (!this.options.hasSelection()) return;
      if (this.options.canvasElement.contains(event.target as Node)) return;
      if (this.inputElement().contains(event.target as Node)) return;
      this.options.clearSelection();
    };

    document.addEventListener("pointerdown", onOutside, {capture: true});
    this.removeOutsideListener = () =>
      document.removeEventListener("pointerdown", onOutside, {capture: true});
  }

  private installViewportListeners(): void {
    if (typeof window === "undefined") return;

    const update = () => this.options.updateViewportBounds();

    window.addEventListener("resize", update, {passive: true});
    window.addEventListener("scroll", update, {passive: true});
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    this.removeViewportListener = () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }

  private inputElement(): HTMLElement {
    return this.options.inputElement ?? this.options.canvasElement;
  }
}
