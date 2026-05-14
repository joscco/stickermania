import {Component, input, output, ViewChild, computed, ElementRef, AfterViewInit, OnDestroy, inject, signal, DestroyRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement, StickerPack, StickerHand} from "@birthday/shared";
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StickerEditorComponent} from '../../../../shared/sticker-editor/sticker-editor.component';

export interface SubmitCollageEvent {
    placements: StickerPlacement[];
    imageDataUrl: string | null;
}

@Component({
    selector: "app-player-building",
    standalone: true,
  imports: [CommonModule, StickerEditorComponent, AnimOnInitDirective, PromptBannerComponent, AnimGroupDirective],
    templateUrl: "./player-building.component.html",
    host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
    public readonly roundIndex = input<number>(0);
    public readonly prompt = input<string>('');
    public readonly myHand = input<StickerHand | null>(null);
    public readonly stickerCatalog = input<StickerDefinition[]>([]);
    public readonly stickerPacks = input<StickerPack[]>([]);
    public readonly maxStickersOnCanvas = input<number>(12);

    public readonly skipRound = output<void>();
    public readonly submitCollage = output<SubmitCollageEvent>();

    @ViewChild("editor") editor!: StickerEditorComponent;

    public readonly handStickers = computed<StickerDefinition[]>(() => {
        const hand = this.myHand();
        if (!hand) return [];
        const ids = new Set(hand.stickerIds);
        return this.stickerCatalog().filter(s => ids.has(s.id));
    });

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
