export class RafPointerMoveCoalescer {
  private frameId: number | null = null;
  private queuedEvent: PointerEvent | null = null;

  constructor(
    private readonly handleMove: (event: PointerEvent) => void,
    private readonly beforeQueue: (event: PointerEvent) => void = () => undefined,
  ) {}

  queue(event: PointerEvent): void {
    this.beforeQueue(event);
    this.queuedEvent = event;

    if (this.frameId !== null) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.flush();
    });
  }

  flush(): void {
    const event = this.queuedEvent;
    this.queuedEvent = null;

    if (event) {
      this.handleMove(event);
    }
  }

  cancel(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.queuedEvent = null;
  }
}
