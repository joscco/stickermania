import {CommonModule} from "@angular/common";
import {Component, computed, input} from "@angular/core";
import {splitPolygonIntoPieces} from "../../geometry";
import {ShapeCuttingPlayerUiState} from "../ui-contract";
import {backgroundHref, pieceFill, pointsToAttribute, pointsToPath, roundedPercent,} from "../shape-cutting-view.util";

@Component({
  selector: "sm-shape-cutting-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./shape-cutting-result.component.html",
})
export class ShapeCuttingResultComponent {
  public readonly state = input.required<ShapeCuttingPlayerUiState>();

  public readonly polygonPoints = computed(() => pointsToAttribute(this.state().variantData.polygon));
  public readonly backgroundHref = computed(() => backgroundHref(this.state().variantData.backgroundSvg));
  public readonly pieces = computed(() => splitPolygonIntoPieces(
      this.state().variantData.polygon,
      this.state().ownResult?.lines ?? this.state().ownSubmission?.lines ?? [],
    ),
  );

  public pointsToPath = pointsToPath;
  public pieceFill = pieceFill;
  public roundedPercent = roundedPercent;
}
