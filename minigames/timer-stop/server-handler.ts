import type {
  MinigameClientAction,
  MinigameHandler,
  MinigamePlayerResult,
  OpenMinigameSubmission,
  RoundVoteResult,
  TimerStopTask,
} from "@birthday/shared";

type TimerStopPayload = {
  stoppedAtSeconds?: unknown;
  elapsedSec?: unknown;
};

type TimerStopResult = MinigamePlayerResult & {
  stoppedAtSeconds: number;
  targetSeconds: number;
  deviationSeconds: number;
};

type TimerStopSubmission = OpenMinigameSubmission & {
  minigameType: "timer-stop";
  payload: {
    stoppedAtSeconds: number;
  };
};

export class TimerStopHandler implements MinigameHandler<TimerStopTask, TimerStopSubmission> {
  public readonly type = "timer-stop";

  public createSubmission(args: {
    playerId: string;
    roundIndex: number;
    task: TimerStopTask;
    action: MinigameClientAction;
    now: number;
  }): TimerStopSubmission | null {
    if (args.action.type !== "submit-minigame" || args.action.minigameType !== this.type) {
      return null;
    }

    const payload = (typeof args.action.payload === "object" && args.action.payload !== null
      ? args.action.payload
      : {}) as TimerStopPayload;
    const stoppedAtSeconds = Number(payload.stoppedAtSeconds ?? payload.elapsedSec);
    if (!Number.isFinite(stoppedAtSeconds) || stoppedAtSeconds < 0) {
      return null;
    }

    return {
      minigameType: this.type,
      playerId: args.playerId,
      roundIndex: args.roundIndex,
      submittedAt: args.now,
      payload: {stoppedAtSeconds},
    };
  }

  public evaluateSubmissions(args: {
    task: TimerStopTask;
    submissions: TimerStopSubmission[];
  }) {
    const targetSeconds = Number(args.task.targetSec);
    const ranked = args.submissions
      .map((submission) => ({
        playerId: submission.playerId,
        stoppedAtSeconds: submission.payload.stoppedAtSeconds,
        targetSeconds,
        deviationSeconds: Math.abs(submission.payload.stoppedAtSeconds - targetSeconds),
      }))
      .sort((a, b) => a.deviationSeconds - b.deviationSeconds);

    const resultsByPlayerId: Record<string, TimerStopResult> = {};
    let previousDeviation: number | null = null;
    let previousPlacement = 0;

    ranked.forEach((entry, index) => {
      const placement = previousDeviation === entry.deviationSeconds ? previousPlacement : index + 1;
      resultsByPlayerId[entry.playerId] = {...entry, placement};
      previousDeviation = entry.deviationSeconds;
      previousPlacement = placement;
    });

    const voteResults: RoundVoteResult[] = ranked.map((entry) => {
      const result = resultsByPlayerId[entry.playerId];
      return {
        submissionId: `minigame_${entry.playerId}_${args.submissions.find(s => s.playerId === entry.playerId)?.roundIndex ?? 0}`,
        playerId: entry.playerId,
        voteCount: 0,
        placement: result?.placement ?? 0,
        result,
      };
    });

    const firstPlace = voteResults.filter((result) => result.placement === 1);
    const winnerId = firstPlace[0]?.playerId ?? null;
    const tiedWinnerIds = firstPlace.slice(1).map((result) => result.playerId);

    return {
      result: {resultsByPlayerId},
      voteResults,
      winnerId,
      tiedWinnerIds,
    };
  }

  public getResultSummary(args: {
    task: TimerStopTask;
    submission: TimerStopSubmission | undefined;
    result: MinigamePlayerResult | undefined;
  }): string {
    const result = args.result as TimerStopResult | undefined;
    if (!args.submission || !result) return "";

    return `${result.stoppedAtSeconds.toFixed(2)}s gestoppt, ${result.deviationSeconds.toFixed(2)}s neben dem Ziel.`;
  }
}
