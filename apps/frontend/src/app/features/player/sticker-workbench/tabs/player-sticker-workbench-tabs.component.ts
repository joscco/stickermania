import {CommonModule} from "@angular/common";
import {Component, input, output} from "@angular/core";
import type {SessionPlayer} from "@stickermania/shared";
import {AnimOnInitDirective} from '../../../../shared/ui/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/ui/svg/svg.component';

export type PlayerStickerSpaceMode = "create" | "edit" | "board" | "profile";

interface WorkbenchModeTab {
  mode: Exclude<PlayerStickerSpaceMode, "profile">;
  icon: string;
  label: string;
}

@Component({
  selector: "app-sticker-workbench-tabs",
  standalone: true,
  imports: [CommonModule, SvgComponent, AnimOnInitDirective],
  templateUrl: "./player-sticker-workbench-tabs.component.html",
})
export class PlayerStickerWorkbenchTabsComponent {
  readonly mode = input.required<PlayerStickerSpaceMode>();
  readonly player = input<SessionPlayer | null>(null);
  readonly showProfile = input(true);
  readonly modeSelected = output<PlayerStickerSpaceMode>();
  readonly profileSelected = output<void>();
  readonly modeTabs: WorkbenchModeTab[] = [
    {mode: "create", icon: "icon-plus", label: "Erstellen"},
    {mode: "edit", icon: "image-pencil", label: "Bearbeiten"},
    {mode: "board", icon: "icon-board", label: "Board"},
  ];

  selectMode(mode: PlayerStickerSpaceMode): void {
    this.modeSelected.emit(mode);
  }

  selectProfile(): void {
    this.profileSelected.emit();
  }
}
