import {Component, input, output, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement, StickerPack, MinigameTask} from "@birthday/shared";
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StickerEditorComponent} from '../../../../shared/sticker-editor/sticker-editor.component';
import {StickerEditorToolbarComponent} from '../../../../shared/sticker-editor/sticker-editor-toolbar/sticker-editor-toolbar.component';
import {StickerBoardComponent} from '../../../../shared/sticker-board/sticker-board.component';
import {DrawingCanvasBgComponent} from '../../../../shared/drawing-canvas-bg/drawing-canvas-bg.component';
import {MinigameChoiceComponent} from '../../../../shared/minigame-choice/minigame-choice.component';
import {MinigameNumberComponent} from '../../../../shared/minigame-number/minigame-number.component';
import {MinigameTimerComponent} from '../../../../shared/minigame-timer/minigame-timer.component';
import {MinigameShapeSplitComponent} from '../../../../shared/minigame-shape-split/minigame-shape-split.component';

export interface SubmitCollageEvent {
    placements: StickerPlacement[];
    imageDataUrl: string | null;
}

export type MinigameSubmitEvent =
  | {type: "submit-sticker-place"; position: {x: number; y: number}; stickerId: string}
  | {type: "submit-drawing"; imageDataUrl: string}
  | {type: "submit-choice"; selectedIndices: number[]}
  | {type: "submit-number"; value: number}
  | {type: "submit-timer"; elapsedSec: number}
  | {type: "submit-shape-split"; cutLine: {a: {x: number; y: number}; b: {x: number; y: number}}; areaFraction: number};

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [
      CommonModule, StickerEditorComponent, StickerEditorToolbarComponent,
      AnimOnInitDirective, PromptBannerComponent, AnimGroupDirective,
      StickerBoardComponent, DrawingCanvasBgComponent,
      MinigameChoiceComponent, MinigameNumberComponent, MinigameTimerComponent,
      MinigameShapeSplitComponent,
    ],
    templateUrl: "./player-building.component.html",
    host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
    public readonly roundIndex = input<number>(0);
    public readonly prompt = input<string>('');
    public readonly task = input<MinigameTask | null>(null);
    public readonly stickerCatalog = input<StickerDefinition[]>([]);
    public readonly stickerPacks = input<StickerPack[]>([]);
    public readonly unlockedPackIds = input<string[]>([]);
    public readonly recommendedPackIds = input<string[]>([]);
    public readonly maxStickersOnCanvas = input<number>(12);

    public readonly skipRound = output<void>();
    public readonly submitCollage = output<SubmitCollageEvent>();
    public readonly submitMinigame = output<MinigameSubmitEvent>();

    @ViewChild("editor") editor!: StickerEditorComponent;
    @ViewChild("stickerBoard") stickerBoard!: StickerBoardComponent;
    @ViewChild("drawingCanvas") drawingCanvas!: DrawingCanvasBgComponent;

    public get placements(): StickerPlacement[] {
        return this.editor?.placements() ?? [];
    }

    public async onSubmitStickerCollage(): Promise<void> {
        const placements = this.editor?.placements() ?? [];
        if (placements.length === 0) return;
        let imageDataUrl: string | null = null;
        try { imageDataUrl = await this.editor.toDataUrl(); } catch {}
        this.submitCollage.emit({ placements, imageDataUrl });
    }

    public onSubmitStickerPlace(): void {
        const pos = this.stickerBoard?.position();
        if (!pos) return;
        this.submitMinigame.emit({type: "submit-sticker-place", position: pos, stickerId: this.task()?.shapePoints ?? "sticker-shapes-heart"});
    }

    public onSubmitDrawing(imageDataUrl: string): void {
        this.submitMinigame.emit({type: "submit-drawing", imageDataUrl});
    }

    public onSubmitChoice(indices: number[]): void {
        this.submitMinigame.emit({type: "submit-choice", selectedIndices: indices});
    }

    public onSubmitNumber(value: number): void {
        this.submitMinigame.emit({type: "submit-number", value});
    }

    public onSubmitTimer(elapsedSec: number): void {
        this.submitMinigame.emit({type: "submit-timer", elapsedSec});
    }

    public onSubmitShapeSplit(event: {cutLine: {a: {x: number; y: number}; b: {x: number; y: number}}; areaFraction: number}): void {
        this.submitMinigame.emit({type: "submit-shape-split", cutLine: event.cutLine, areaFraction: event.areaFraction});
    }
}
