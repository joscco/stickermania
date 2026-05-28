import {CommonModule} from "@angular/common";
import {
  Component,
  ElementRef,
  OnChanges,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {Point} from "../geometry";
import {ShapeCuttingVariantData} from "../game";
import {ShapeCuttingEditorEvent, ShapeCuttingEditorState} from "../player-ui/ui-contract";
import {backgroundHref, pointsToAttribute} from "../player-ui/shape-cutting-view.util";

@Component({
  selector: "sm-shape-cutting-editor",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./shape-cutting-editor.component.html",
})
export class ShapeCuttingEditorComponent implements OnChanges {
  public readonly state = input.required<ShapeCuttingEditorState>();
  public readonly playerEvent = output<ShapeCuttingEditorEvent>();
  public readonly svg = viewChild<ElementRef<SVGSVGElement>>("svg");

  public readonly variant = signal<ShapeCuttingVariantData | null>(null);
  public readonly draggingPointIndex = signal<number | null>(null);

  public ngOnChanges(): void {
    this.variant.set(cloneVariant(this.state().variant));
  }

  public polygonPoints(variant: ShapeCuttingVariantData): string {
    return pointsToAttribute(variant.polygon);
  }

  public backgroundHref(backgroundSvg: string | null): string | null {
    return backgroundHref(backgroundSvg);
  }

  public setTitle(event: Event): void {
    this.patchVariant({title: (event.target as HTMLInputElement).value});
  }

  public setDuration(event: Event): void {
    this.patchVariant({firstRoundSeconds: clampInt((event.target as HTMLInputElement).value, 10, 180)});
  }

  public setTargetParts(event: Event): void {
    this.patchVariant({targetParts: clampInt((event.target as HTMLInputElement).value, 2, 6)});
  }

  public setBackground(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.patchVariant({backgroundSvg: value.length > 0 ? value : null});
  }

  public addPoint(): void {
    const variant = this.variant();
    if (!variant) return;

    const polygon = variant.polygon;
    const last = polygon[polygon.length - 1] ?? {x: 180, y: 240};
    const next = {
      x: Math.max(20, Math.min(340, last.x + 24)),
      y: Math.max(20, Math.min(460, last.y + 24)),
    };
    this.patchVariant({polygon: [...polygon, next]});
  }

  public removePoint(index: number): void {
    const variant = this.variant();
    if (!variant || variant.polygon.length <= 3) return;

    this.patchVariant({polygon: variant.polygon.filter((_, pointIndex) => pointIndex !== index)});
  }

  public onPointDown(index: number, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.draggingPointIndex.set(index);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  public onPointerMove(event: PointerEvent): void {
    const index = this.draggingPointIndex();
    if (index === null) return;

    const point = this.pointerToStagePoint(event);
    if (!point) return;

    const variant = this.variant();
    if (!variant) return;

    const polygon = variant.polygon.map((entry, pointIndex) =>
      pointIndex === index
        ? {
            x: Math.round(Math.max(0, Math.min(360, point.x))),
            y: Math.round(Math.max(0, Math.min(480, point.y))),
          }
        : entry,
    );
    this.patchVariant({polygon});
    this.playerEvent.emit({
      type: "polygon-point-change",
      pointIndex: index,
      point: polygon[index],
    });
  }

  public onPointerUp(): void {
    this.draggingPointIndex.set(null);
  }

  private patchVariant(patch: Partial<ShapeCuttingVariantData>): void {
    const current = this.variant();
    if (!current) return;

    const next = cloneVariant({...current, ...patch});
    this.variant.set(next);
    this.playerEvent.emit({type: "variant-change", variant: next});
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

function cloneVariant(variant: ShapeCuttingVariantData): ShapeCuttingVariantData {
  return {
    ...variant,
    polygon: variant.polygon.map((point) => ({...point})),
  };
}

function clampInt(value: string, min: number, max: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}
