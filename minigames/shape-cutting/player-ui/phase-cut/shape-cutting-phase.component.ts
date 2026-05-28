import {CommonModule} from "@angular/common";
import {
  Component,
  ElementRef,
  OnChanges,
  computed,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {CutLine, Point, splitPolygonIntoPieces} from "../../geometry";
import {ShapeCuttingPlayerUiEvent, ShapeCuttingPlayerUiState} from "../ui-contract";
import {
  backgroundHref,
  initialCutLines,
  pieceFill,
  pointsToAttribute,
  pointsToPath,
  roundedPercent,
} from "../shape-cutting-view.util";

type DragHandle = {
  lineIndex: number;
  endpoint: "a" | "b";
};

@Component({
  selector: "sm-shape-cutting-phase",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./shape-cutting-phase.component.html",
})
export class ShapeCuttingPhaseComponent implements OnChanges {
  public readonly state = input.required<ShapeCuttingPlayerUiState>();
  public readonly playerEvent = output<ShapeCuttingPlayerUiEvent>();
  public readonly svg = viewChild<ElementRef<SVGSVGElement>>("svg");

  public readonly lines = signal<CutLine[]>([]);
  public readonly dragging = signal<DragHandle | null>(null);

  public readonly polygonPoints = computed(() => pointsToAttribute(this.state().variantData.polygon));
  public readonly backgroundHref = computed(() => backgroundHref(this.state().variantData.backgroundSvg));
  public readonly pieces = computed(() =>
    splitPolygonIntoPieces(this.state().variantData.polygon, this.lines()),
  );
  public readonly targetPercent = computed(() =>
    roundedPercent(1 / Math.max(2, this.state().variantData.targetParts)),
  );
  public readonly pieceSummary = computed(() =>
    this.pieces().map((piece) => `${roundedPercent(piece.fraction)}%`).join(" / "),
  );

  public ngOnChanges(): void {
    const draftLines = this.state().draft?.lines;
    this.lines.set(cloneLines(
      draftLines && draftLines.length > 0
        ? draftLines
        : initialCutLines(this.state().variantData.targetParts),
    ));
  }

  public onHandleDown(lineIndex: number, endpoint: "a" | "b", event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set({lineIndex, endpoint});
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  public onPointerMove(event: PointerEvent): void {
    const dragging = this.dragging();
    if (!dragging) return;

    const point = this.pointerToStagePoint(event);
    if (!point) return;

    const clamped = {
      x: Math.max(0, Math.min(360, point.x)),
      y: Math.max(0, Math.min(480, point.y)),
    };

    this.lines.update((lines) =>
      lines.map((line, index) =>
        index === dragging.lineIndex
          ? {...line, [dragging.endpoint]: clamped}
          : line,
      ),
    );
    this.emitDraft();
  }

  public onPointerUp(): void {
    this.dragging.set(null);
  }

  public pointsToPath(points: Point[]): string {
    return pointsToPath(points);
  }

  public pieceFill(index: number): string {
    return pieceFill(index);
  }

  private emitDraft(): void {
    this.playerEvent.emit({
      type: "draft-change",
      playerId: this.state().playerId,
      draft: {lines: cloneLines(this.lines())},
    });
  }

  private pointerToStagePoint(event: PointerEvent): Point | null {
    const svg = this.svg()?.nativeElement;
    if (!svg) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;

    return point.matrixTransform(matrix.inverse());
  }
}

function cloneLines(lines: CutLine[]): CutLine[] {
  return lines.map((line) => ({
    a: {...line.a},
    b: {...line.b},
  }));
}
