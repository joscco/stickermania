import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {MinigameTask} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {RoundInfoComponent} from '../../../../shared/round-info/round-info.component';
import {PlayerStatusScreenComponent} from '../../player-status-screen/player-status-screen.component';
import PlacementBadgeComponent from '../../../shared/placement-badge/placement-badge.component';

@Component({
    selector: "app-player-results",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, PlayerStatusScreenComponent, RoundInfoComponent, PlacementBadgeComponent],
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
    public readonly resultSummary = input<string>("");

    public readonly readyToAdvance = output<void>();

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
