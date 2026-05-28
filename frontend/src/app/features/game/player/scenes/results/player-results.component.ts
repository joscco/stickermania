import {Component, computed, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {MinigameTask, OpenMinigameSubmission, RoundVoteResult} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {RoundInfoComponent} from '../../../../shared/round-info/round-info.component';
import {PlayerStatusScreenComponent} from '../../player-status-screen/player-status-screen.component';
import {MinigameStageComponent} from "../../../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";
import {TimerStopResultComponent} from "../../../../../../../../minigames/timer-stop/player-ui/result/timer-stop-result.component";
import {
    TIMER_STOP_STAGE_SIZE,
    TimerStopPlayerUiState,
} from "../../../../../../../../minigames/timer-stop/player-ui/ui-contract";

@Component({
    selector: "app-player-results",
    standalone: true,
    imports: [
        CommonModule,
        AnimOnInitDirective,
        PlayerStatusScreenComponent,
        RoundInfoComponent,
        MinigameStageComponent,
        TimerStopResultComponent,
    ],
    templateUrl: "./player-results.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerResultsComponent {
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
    public readonly stageSize = TIMER_STOP_STAGE_SIZE;

    public readonly timerStopResultState = computed<TimerStopPlayerUiState | null>(() => {
        const task = this.currentTask();
        const voteResult = this.myMinigameResult();
        const minigameResult = voteResult?.result as TimerStopPlayerUiState["ownResult"] | undefined;
        if (!task || task.type !== "timer-stop" || !minigameResult) return null;

        const submission = this.myMinigameSubmission();
        const payload = (submission?.payload && typeof submission.payload === "object")
            ? submission.payload as {stoppedAtSeconds?: unknown}
            : {};

        return {
            playerId: this.myPlayerId(),
            phase: "result",
            variantData: {
                id: task.id,
                title: task.title,
                firstRoundSeconds: Number(task.durationSec ?? 0),
                targetSeconds: Number(task.targetSec),
            },
            ownSubmission: typeof payload.stoppedAtSeconds === "number"
                ? {playerId: this.myPlayerId(), stoppedAtSeconds: payload.stoppedAtSeconds}
                : undefined,
            ownResult: minigameResult,
            roundEndsAt: 0,
            serverNow: Date.now(),
        };
    });

    public taskResultLabel(task: MinigameTask): string {
        switch (task.type) {
            case "thesis": return "Wer am nächsten an der tatsächlichen Zustimmungs-Quote lag, gewinnt.";
            case "number": return "Am nächsten am Durchschnitt aller Antworten.";
            case "timer-stop": return "Am nächsten an der Zielzeit.";
            case "shape-split": return "Am nächsten an der Ziel-Proportion.";
            case "drawing": case "text-answer": case "sticker-place": case "choice":
                return "Die meisten Stimmen gewinnen.";
            default: return "";
        }
    }
}
