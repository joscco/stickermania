import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {MinigameTask} from "@birthday/shared";
import {getMinigameFrontendDefinition} from "../../../../../../minigames/frontend-registry";

@Component({
  selector: "app-round-info",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./round-info.component.html",
  host: {"class": "block"},
})
export class RoundInfoComponent {
  readonly roundIndex = input(0);
  readonly title = input("");
  readonly task = input<MinigameTask | null>(null);

  readonly scoringInfo = computed(() => {
    const t = this.task();
    if (!t) return "";
    const minigameInfo = getMinigameFrontendDefinition(t.type)?.scoringInfo();
    if (minigameInfo) return minigameInfo;

    switch (t.type) {
      case "thesis": return "Schätze, wie viele zustimmen — am nächsten dran gewinnt";
      case "number": return "Am nächsten am Durchschnitt gewinnt";
      case "shape-split": return "Am nächsten an der Ziel-Proportion gewinnt";
      case "sticker-place": {
        const goal = (t as any).goal;
        return goal === "furthest-from-average" ? "Möglichst weit vom Durchschnitt gewinnt" : "Am nächsten am Durchschnitt gewinnt";
      }
      case "choice": return "Die beliebteste Wahl gewinnt";
      case "drawing": return "Abstimmung: Wer hat den Zusatzauftrag am besten umgesetzt?";
      case "text-answer": return "Abstimmung: Welche Antwort passt am besten?";
      default: return "";
    }
  });
}
