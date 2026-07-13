import {capturePointer, releasePointer} from "./pointer-event-utils";

export type ClientPoint = {
  clientX: number;
  clientY: number;
};

export type PointerSessionPoint<TPoint> = {
  pointerId: number;
  pointerType: string;
  client: ClientPoint;
  point: TPoint;
};

export type PointerSessionOptions<TPoint> = {
  surface: () => HTMLElement | null;
  toPoint: (event: PointerEvent) => TPoint;
  leftMouseOnly?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  capturePointers?: boolean;
};

export class PointerSession<TPoint> {
  private readonly pointersById = new Map<number, PointerSessionPoint<TPoint>>();

  constructor(private readonly options: PointerSessionOptions<TPoint>) {}

  start(event: PointerEvent): boolean {
    if (!this.isAllowedPointerStart(event)) {
      return false;
    }

    const surface = this.options.surface();

    if (!surface) {
      return false;
    }

    this.applyEventOptions(event);

    if (this.options.capturePointers ?? true) {
      capturePointer(surface, event.pointerId);
    }

    this.pointersById.set(event.pointerId, this.pointFromEvent(event));
    return true;
  }

  move(event: PointerEvent): boolean {
    if (!this.pointersById.has(event.pointerId)) {
      return false;
    }

    this.applyEventOptions(event);
    this.pointersById.set(event.pointerId, this.pointFromEvent(event));
    return true;
  }

  end(event: PointerEvent): boolean {
    const hadPointer = this.pointersById.delete(event.pointerId);

    if (!hadPointer) {
      return false;
    }

    this.applyEventOptions(event);
    this.releasePointer(event.pointerId);
    return true;
  }

  cancel(event?: PointerEvent): void {
    if (event) {
      this.pointersById.delete(event.pointerId);
      this.releasePointer(event.pointerId);
      return;
    }

    this.clear();
  }

  clear(): void {
    const pointerIds = [...this.pointersById.keys()];
    this.pointersById.clear();

    for (const pointerId of pointerIds) {
      this.releasePointer(pointerId);
    }
  }

  has(pointerId: number): boolean {
    return this.pointersById.has(pointerId);
  }

  count(): number {
    return this.pointersById.size;
  }

  points(): Array<PointerSessionPoint<TPoint>> {
    return [...this.pointersById.values()];
  }

  firstPoint(): PointerSessionPoint<TPoint> | null {
    return this.points()[0] ?? null;
  }

  twoPoints(): [PointerSessionPoint<TPoint>, PointerSessionPoint<TPoint>] | null {
    const points = this.points();

    if (points.length < 2) {
      return null;
    }

    return [points[0], points[1]];
  }

  private isAllowedPointerStart(event: PointerEvent): boolean {
    return !((this.options.leftMouseOnly ?? true) && event.pointerType === "mouse" && event.button !== 0);
  }

  private pointFromEvent(event: PointerEvent): PointerSessionPoint<TPoint> {
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      client: {
        clientX: event.clientX,
        clientY: event.clientY,
      },
      point: this.options.toPoint(event),
    };
  }

  private applyEventOptions(event: PointerEvent): void {
    if (this.options.preventDefault ?? true) {
      event.preventDefault();
    }

    if (this.options.stopPropagation ?? false) {
      event.stopPropagation();
    }
  }

  private releasePointer(pointerId: number): void {
    const surface = this.options.surface();

    if (!surface || !(this.options.capturePointers ?? true)) {
      return;
    }

    releasePointer(surface, pointerId);
  }
}
