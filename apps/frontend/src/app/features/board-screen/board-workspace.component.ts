import {CommonModule} from "@angular/common";
import {Component, input, output} from "@angular/core";
import {type BoardStickerPlacement, type StickerDefinition, type StickerPlacement} from "@stickermania/shared";
import {AnimOnInitDirective} from "../../shared/ui/animations/anim-on-init.directive";
import {SvgComponent} from "../../shared/ui/svg/svg.component";
import {StickerBoardViewportComponent} from "../../shared/stickers/board-viewport/surface/sticker-board-viewport.component";
import {type BoardMode} from "./board-session.controller";

@Component({
  selector: "app-board-workspace",
  standalone: true,
  imports: [
    CommonModule,
    AnimOnInitDirective,
    StickerBoardViewportComponent,
    SvgComponent,
  ],
  templateUrl: "./board-workspace.component.html",
  host: {style: "display: block; height: 100%;"},
})
export class BoardWorkspaceComponent {
  public readonly worldReady = input(false);
  public readonly boardMode = input.required<BoardMode>();
  public readonly showPlacementAuthors = input(false);
  public readonly placements = input<BoardStickerPlacement[]>([]);
  public readonly stickerCatalog = input<StickerDefinition[]>([]);
  public readonly placementBadges = input<Record<string, {name: string; avatarUrl: string | null}>>({});
  public readonly pixiMaxResolution = input(2);
  public readonly pixiWarmupFrames = input(2);

  public readonly modeSelected = output<BoardMode>();
  public readonly placementAuthorsVisibleChanged = output<boolean>();
  public readonly placementsChanged = output<StickerPlacement[]>();
  public readonly selectionChanged = output<boolean>();
}
