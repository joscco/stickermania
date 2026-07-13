import type {CanvasPoint, CropMode} from "./crop-editor.types";

export type CropSelectionCommandServiceOptions = {
  getMode: () => CropMode;
  getCanvasPixelRatio: () => number;
  getSelectedPolygonPointIndex: () => number | null;
  setSelectedPolygonPointIndex: (index: number | null) => void;
  setHasSelection: (hasSelection: boolean) => void;
  setPreviewReady: (ready: boolean) => void;
  setPreviewDataUrl: (dataUrl: string | null) => void;
  renderPreview: () => void;
  redraw: () => void;
};

export class CropSelectionCommandService {
  private selectionPath: CanvasPoint[] = [];
  private drawing = false;
  private lassoPointerId: number | null = null;
  private polygonDragPointerId: number | null = null;
  private polygonDragStartPoint: CanvasPoint | null = null;

  constructor(private readonly options: CropSelectionCommandServiceOptions) {}

  path(): CanvasPoint[] {
    return this.selectionPath;
  }

  reset(): void {
    this.selectionPath = [];
    this.drawing = false;
    this.lassoPointerId = null;
    this.polygonDragPointerId = null;
    this.polygonDragStartPoint = null;
    this.options.setSelectedPolygonPointIndex(null);
    this.invalidatePreview();
  }

  clearActivePointerState(): void {
    this.drawing = false;
    this.lassoPointerId = null;
    this.polygonDragPointerId = null;
    this.polygonDragStartPoint = null;
    this.options.setSelectedPolygonPointIndex(null);
  }

  prepareForMode(mode: CropMode): void {
    this.clearActivePointerState();

    if (mode === "lasso" || mode === "polygon-lasso") {
      this.selectionPath = [];
      this.invalidatePreview();
      this.options.redraw();
    }
  }

  startFreehandLasso(point: CanvasPoint, pointerId: number): boolean {
    if (this.lassoPointerId !== null) {
      return false;
    }

    this.lassoPointerId = pointerId;
    this.drawing = true;
    this.selectionPath = [point];
    this.invalidatePreview();
    this.options.redraw();

    return true;
  }

  moveFreehandLasso(point: CanvasPoint, pointerId: number): void {
    if (pointerId !== this.lassoPointerId || !this.drawing) {
      return;
    }

    this.selectionPath.push(point);
    this.options.redraw();
  }

  finishFreehandLasso(pointerId: number | null): void {
    if (pointerId !== null && pointerId !== this.lassoPointerId) {
      return;
    }

    this.lassoPointerId = null;

    if (!this.drawing) {
      return;
    }

    this.drawing = false;

    const hasSelection = this.selectionPath.length > 8;
    this.options.setHasSelection(hasSelection);

    if (hasSelection) {
      this.options.renderPreview();
    }
  }

  handlePolygonPointerDown(point: CanvasPoint, pointerId: number): boolean {
    if (this.polygonDragPointerId !== null && this.polygonDragPointerId !== pointerId) {
      return false;
    }

    const pointIndex = this.hitPolygonPoint(point);

    if (pointIndex !== null) {
      this.options.setSelectedPolygonPointIndex(pointIndex);
      this.polygonDragPointerId = pointerId;
      this.polygonDragStartPoint = point;
      this.options.redraw();
      return true;
    }

    const edgeIndex = this.hitPolygonEdge(point);

    if (edgeIndex !== null) {
      const insertIndex = edgeIndex + 1;

      this.selectionPath = [
        ...this.selectionPath.slice(0, insertIndex),
        point,
        ...this.selectionPath.slice(insertIndex),
      ];

      this.options.setSelectedPolygonPointIndex(insertIndex);
      this.polygonDragPointerId = pointerId;
      this.polygonDragStartPoint = point;
      this.invalidatePreview();
      this.options.redraw();
      return true;
    }

    this.selectionPath = [...this.selectionPath, point];
    this.options.setSelectedPolygonPointIndex(this.selectionPath.length - 1);
    this.polygonDragPointerId = pointerId;
    this.polygonDragStartPoint = point;
    this.invalidatePreview();
    this.options.redraw();

    return true;
  }

  handlePolygonPointerMove(point: CanvasPoint, pointerId: number): void {
    const selectedIndex = this.options.getSelectedPolygonPointIndex();

    if (pointerId !== this.polygonDragPointerId || selectedIndex === null) {
      return;
    }

    if (!this.polygonDragStartPoint || this.distance(point, this.polygonDragStartPoint) < 2 * this.options.getCanvasPixelRatio()) {
      return;
    }

    this.selectionPath = this.selectionPath.map((pathPoint, index) => index === selectedIndex ? point : pathPoint);
    this.invalidatePreview();
    this.options.redraw();
  }

  finishPolygonPointer(pointerId: number | null): void {
    if (pointerId !== null && pointerId !== this.polygonDragPointerId) {
      return;
    }

    this.polygonDragPointerId = null;
    this.polygonDragStartPoint = null;
  }

  deleteSelectedPolygonPoint(): void {
    const selectedIndex = this.options.getSelectedPolygonPointIndex();

    if (this.options.getMode() !== "polygon-lasso" || selectedIndex === null) {
      return;
    }

    this.selectionPath = this.selectionPath.filter((_, index) => index !== selectedIndex);
    this.options.setSelectedPolygonPointIndex(null);
    this.invalidatePreview();
    this.options.redraw();
  }

  finishPolygonSelection(): void {
    if (!this.canFinishPolygonSelection()) {
      return;
    }

    this.drawing = false;
    this.options.setHasSelection(true);
    this.options.renderPreview();
  }

  canFinishPolygonSelection(): boolean {
    return this.options.getMode() === "polygon-lasso" && this.selectionPath.length >= 3;
  }

  selectedPolygonPointCssPosition(canvas: HTMLCanvasElement | null): CanvasPoint | null {
    const selectedIndex = this.options.getSelectedPolygonPointIndex();
    const point = selectedIndex === null ? null : this.selectionPath[selectedIndex];

    if (!point || !canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const x = point.x * rect.width / canvas.width;
    const y = point.y * rect.height / canvas.height;

    return {
      x: Math.max(8, Math.min(rect.width - 32, x + 10)),
      y: Math.max(60, Math.min(rect.height - 32, y - 30)),
    };
  }

  private invalidatePreview(): void {
    this.options.setHasSelection(false);
    this.options.setPreviewReady(false);
    this.options.setPreviewDataUrl(null);
  }

  private hitPolygonPoint(point: CanvasPoint): number | null {
    const hitRadius = 18 * this.options.getCanvasPixelRatio();

    for (let index = this.selectionPath.length - 1; index >= 0; index--) {
      if (this.distance(point, this.selectionPath[index]) <= hitRadius) {
        return index;
      }
    }

    return null;
  }

  private hitPolygonEdge(point: CanvasPoint): number | null {
    if (this.selectionPath.length < 2) {
      return null;
    }

    const hitDistance = 14 * this.options.getCanvasPixelRatio();
    const edgeCount = this.selectionPath.length >= 3 ? this.selectionPath.length : this.selectionPath.length - 1;

    for (let index = 0; index < edgeCount; index++) {
      const start = this.selectionPath[index];
      const end = this.selectionPath[(index + 1) % this.selectionPath.length];

      if (this.distanceToSegment(point, start, end) <= hitDistance) {
        return index;
      }
    }

    return null;
  }

  private distanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): number {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;

    if (lengthSquared === 0) {
      return this.distance(point, start);
    }

    const segmentPosition = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
      ),
    );

    return this.distance(point, {
      x: start.x + segmentPosition * deltaX,
      y: start.y + segmentPosition * deltaY,
    });
  }

  private distance(firstPoint: CanvasPoint, secondPoint: CanvasPoint): number {
    return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
  }
}
