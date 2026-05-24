import {Component, input, output, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement, StickerPack} from "@birthday/shared";
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StickerEditorComponent} from '../../../../shared/sticker-editor/sticker-editor.component';
import {SvgComponent} from '../../../../shared/svg/svg.component';

export interface SubmitCollageEvent {
    placements: StickerPlacement[];
    imageDataUrl: string | null;
}

@Component({
    selector: "app-player-building",
    standalone: true,
  imports: [CommonModule, StickerEditorComponent, SvgComponent, AnimOnInitDirective, PromptBannerComponent, AnimGroupDirective],
    templateUrl: "./player-building.component.html",
    host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
    public readonly roundIndex = input<number>(0);
    public readonly prompt = input<string>('');
    public readonly stickerCatalog = input<StickerDefinition[]>([]);
    public readonly stickerPacks = input<StickerPack[]>([]);
    public readonly unlockedPackIds = input<string[]>([]);
    public readonly recommendedPackIds = input<string[]>([]);
    public readonly timerNotification = input('');
    public readonly maxStickersOnCanvas = input<number>(12);

    public readonly skipRound = output<void>();
    public readonly submitCollage = output<SubmitCollageEvent>();

    @ViewChild("editor") editor!: StickerEditorComponent;

    public get placements(): StickerPlacement[] {
        return this.editor?.placements() ?? [];
    }

    public async onSubmit(): Promise<void> {
        const placements = this.editor?.placements() ?? [];
        if (placements.length === 0) return;

        let imageDataUrl: string | null = null;
        try { imageDataUrl = await this.editor.toDataUrl(); } catch {}

        this.submitCollage.emit({ placements, imageDataUrl });
    }
}
