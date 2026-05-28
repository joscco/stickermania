import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";
import type {MinigameTask, OpenMinigameSubmission, RoundVoteResult} from "@birthday/shared";
import {MinigameComponentHostComponent} from "../../../../../../../../minigames/_shared/minigame-component-host/minigame-component-host.component";
import {MinigameStageComponent} from "../../../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";
import {
    MINIGAME_STAGE_HEIGHT,
    MINIGAME_STAGE_WIDTH,
} from "../../../../../../../../minigames/_shared/minigame-stage-size";
import {getMinigameFrontendDefinition} from "../../../../../../../../minigames/frontend-registry";
import {AnimOnInitDirective} from "../../../../shared/animations/anim-on-init.directive";
import {RoundInfoComponent} from "../../../../shared/round-info/round-info.component";
import {PlayerStatusScreenComponent} from "../../player-status-screen/player-status-screen.component";

@Component({
    selector: "app-player-results",
    standalone: true,
    imports: [
        CommonModule,
        AnimOnInitDirective,
        PlayerStatusScreenComponent,
        RoundInfoComponent,
        MinigameStageComponent,
        MinigameComponentHostComponent,
    ],
    templateUrl: "./player-results.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerResultsComponent {
    public readonly stageContainerMaxWidth = `min(100%, calc((100dvh - 9rem) * ${MINIGAME_STAGE_WIDTH} / ${MINIGAME_STAGE_HEIGHT}))`;

    public readonly myPlacement = input<number | null>(null);
    public readonly myVoteCount = input<number>(0);
    public readonly isWinner = input<boolean>(false);
    public readonly isTiedWinner = input<boolean>(false);
    public readonly winnerName = input<string>('');
    public readonly currentTask = input<MinigameTask | null>(null);
    public readonly myPlayerId = input<string>("");
    public readonly myMinigameSubmission = input<OpenMinigameSubmission | null>(null);
    public readonly myMinigameResult = input<RoundVoteResult | null>(null);
    public readonly resultSummary = input<string>("");

    public readonly readyToAdvance = output<void>();

    public readonly minigameDefinition = computed(() =>
        getMinigameFrontendDefinition(this.currentTask()?.type),
    );

    public readonly minigameResultState = computed(() => {
        const task = this.currentTask();
        const definition = this.minigameDefinition();
        const minigameResult = this.myMinigameResult()?.result;
        if (!task || !definition || !minigameResult) return null;

        return definition.createResultState({
            playerId: this.myPlayerId(),
            task,
            ownSubmission: this.myMinigameSubmission() ?? undefined,
            ownResult: minigameResult,
            roundEndsAt: 0,
            serverNow: Date.now(),
        });
    });

    public taskResultLabel(task: MinigameTask): string {
        return getMinigameFrontendDefinition(task.type)?.scoringInfo() ?? "";
    }
}
