import type {
  Minigame,
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
  MinigameVariantData,
} from "../../packages/shared/src/minigame.js";

export interface UnexpectedTaskVariantData extends MinigameVariantData {
  id: string;
  title: string;
  firstRoundSeconds: number;
  secondRoundSeconds: number;
  answerQuestion: string;
  ratingQuestion: string;
  sampleAnswers: string[];
}

export interface UnexpectedTaskAnswerOption {
  id: string;
  playerId: string | null;
  answer: string;
  isPlayerAnswer: boolean;
}

export interface UnexpectedTaskComparison {
  left: UnexpectedTaskAnswerOption;
  right: UnexpectedTaskAnswerOption;
}

export type UnexpectedTaskSubmission =
  | UnexpectedTaskAnswerSubmission
  | UnexpectedTaskRatingSubmission;

export interface UnexpectedTaskAnswerSubmission extends MinigameSubmission {
  playerId: string;
  phase: "answer";
  answer: string;
}

export interface UnexpectedTaskRatingSubmission extends MinigameSubmission {
  playerId: string;
  phase: "rate";
  selectedAnswerId: string;
}

export interface UnexpectedTaskPlayerResult extends MinigamePlayerResult {
  playerId: string;
  answer: string;
  ratingCount: number;
}

export class UnexpectedTaskGame implements Minigame<
  UnexpectedTaskVariantData,
  UnexpectedTaskSubmission,
  UnexpectedTaskPlayerResult
> {
  public constructor(
    private readonly variantData: UnexpectedTaskVariantData,
    private readonly answerOptions: UnexpectedTaskAnswerOption[] = [],
  ) {}

  public provideData(): UnexpectedTaskVariantData {
    return this.variantData;
  }

  public calculateResults(
    submissions: UnexpectedTaskSubmission[],
  ): MinigameResult<UnexpectedTaskPlayerResult> {
    const ratingCountsByAnswerId: Record<string, number> = {};
    for (const submission of submissions) {
      if (submission.phase !== "rate") continue;
      ratingCountsByAnswerId[submission.selectedAnswerId] =
        (ratingCountsByAnswerId[submission.selectedAnswerId] ?? 0) + 1;
    }

    const ranked = this.answerOptions
      .filter((answerOption) => answerOption.isPlayerAnswer && answerOption.playerId !== null)
      .map((answerOption) => ({
        playerId: answerOption.playerId ?? "",
        answer: answerOption.answer,
        ratingCount: ratingCountsByAnswerId[answerOption.id] ?? 0,
      }))
      .sort(
        (a, b) =>
          b.ratingCount - a.ratingCount ||
          a.answer.localeCompare(b.answer) ||
          a.playerId.localeCompare(b.playerId),
      );

    const resultsByPlayerId: Record<string, UnexpectedTaskPlayerResult> = {};
    let previousRatingCount: number | null = null;
    let previousPlacement = 0;

    ranked.forEach((entry, index) => {
      const placement =
        previousRatingCount === entry.ratingCount ? previousPlacement : index + 1;
      resultsByPlayerId[entry.playerId] = {...entry, placement};
      previousRatingCount = entry.ratingCount;
      previousPlacement = placement;
    });

    return {resultsByPlayerId};
  }
}
