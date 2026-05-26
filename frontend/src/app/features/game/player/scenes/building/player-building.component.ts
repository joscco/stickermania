import {Component, input, output, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {MinigameTask} from "@birthday/shared";
import {AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {MinigameShellComponent} from '../../../../minigames/_shared/minigame-shell.component';
import {StickerBoardComponent} from '../../../../minigames/sticker-place/play/sticker-board.component';
import {DrawingCanvasBgComponent} from '../../../../minigames/drawing/play/drawing-canvas-bg.component';
import {MinigameChoiceComponent} from '../../../../minigames/choice/play/minigame-choice.component';
import {MinigameNumberComponent} from '../../../../minigames/number/play/minigame-number.component';
import {MinigameTimerComponent} from '../../../../minigames/timer-stop/play/minigame-timer.component';
import {MinigameShapeSplitComponent} from '../../../../minigames/shape-split/play/minigame-shape-split.component';
import {MinigameTextAnswerComponent} from '../../../../minigames/text-answer/play/minigame-text-answer.component';
import {MinigameThesisComponent} from '../../../../minigames/thesis/play/minigame-thesis.component';

export type MinigameSubmitEvent =
  | {type: "submit-sticker-place"; positions: Array<{stickerId: string; x: number; y: number}>}
  | {type: "submit-drawing"; imageDataUrl: string}
  | {type: "submit-choice"; selectedIndices: number[]}
  | {type: "submit-number"; value: number}
  | {type: "submit-timer"; elapsedSec: number}
  | {type: "submit-shape-split"; cutLine: {a: {x: number; y: number}; b: {x: number; y: number}}; areaFraction: number}
  | {type: "submit-text-answer"; answer: string}
  | {type: "submit-thesis"; agreed: boolean; estimatedPercent: number};

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [
      CommonModule,
      MinigameShellComponent, AnimGroupDirective,
      StickerBoardComponent, DrawingCanvasBgComponent,
      MinigameChoiceComponent, MinigameNumberComponent, MinigameTimerComponent,
      MinigameShapeSplitComponent,
      MinigameTextAnswerComponent, MinigameThesisComponent,
    ],
    templateUrl: "./player-building.component.html",
    host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
    public readonly roundIndex = input<number>(0);
    public readonly prompt = input<string>('');
    public readonly task = input<MinigameTask | null>(null);

    public readonly skipRound = output<void>();
    public readonly submitMinigame = output<MinigameSubmitEvent>();

    @ViewChild("stickerBoard") stickerBoard?: StickerBoardComponent;
    @ViewChild("drawingCanvas") drawingCanvas?: DrawingCanvasBgComponent;
    @ViewChild("choiceCmp") choiceCmp?: MinigameChoiceComponent;
    @ViewChild("numberCmp") numberCmp?: MinigameNumberComponent;
    @ViewChild("timerCmp") timerCmp?: MinigameTimerComponent;
    @ViewChild("splitCmp") splitCmp?: MinigameShapeSplitComponent;
    @ViewChild("textCmp") textCmp?: MinigameTextAnswerComponent;
    @ViewChild("thesisCmp") thesisCmp?: MinigameThesisComponent;

    public submitCurrentTask(): void {
      const t = this.task();
      if (!t) return;
      switch (t.type) {
        case "sticker-place": {
          const pos = this.stickerBoard?.getPositions();
          if (pos) this.submitMinigame.emit({type: "submit-sticker-place", positions: pos});
          break;
        }
        case "drawing":
          this.drawingCanvas?.submit();
          break;
        case "choice":
          this.choiceCmp?.submit();
          break;
        case "number":
          this.numberCmp?.submit();
          break;
        case "timer-stop":
          this.timerCmp?.submit();
          break;
        case "shape-split":
          this.splitCmp?.submit();
          break;
        case "text-answer":
          this.textCmp?.submit();
          break;
        case "thesis":
          this.thesisCmp?.submit();
          break;
      }
    }

    // Kept for output compatibility — called from child components
    public onSubmitStickerPlace(): void {
        const positions = this.stickerBoard?.getPositions();
        if (!positions || positions.length === 0) return;
        this.submitMinigame.emit({type: "submit-sticker-place", positions});
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

    public onSubmitTextAnswer(answer: string): void {
        this.submitMinigame.emit({type: "submit-text-answer", answer});
    }

    public onSubmitThesis(event: {agreed: boolean; estimatedPercent: number}): void {
        this.submitMinigame.emit({type: "submit-thesis", agreed: event.agreed, estimatedPercent: event.estimatedPercent});
    }
}
