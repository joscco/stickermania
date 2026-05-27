import {Minigame, MinigamePlayerResult, MinigameResult, MinigameSubmission, MinigameVariantData} from "../../packages/shared/src/minigame";

export interface EstimateOpinionsGameVariantData extends MinigameVariantData {
    question: string; // Ananas ist ein legitimer Pizzabelag.
    optionA: string; // Stimme zu
    optionB: string; // Stimme nicht zu
}

export interface EstimateOpinionsGameSubmission extends MinigameSubmission {
    playerId: string; // id of the player
    choseOptionA: boolean; // Did the player use option A?
    estimatedPercentageWithSameOpinion: number; // value between 0 and 1
}

export interface EstimateOpinionsGamePlayerResult extends MinigamePlayerResult {
    playerId: string;
    placement: number; // What place did the player make
    chosenOption: string; // What option did they chose
    estimatedPercentageWithSameOpinion: number; // What percentage did he think had the same opinion
    realPercentageWithSameOpinion: number; // How many did really think as he did
}

export class EstimateOptionsGame implements Minigame<
    EstimateOpinionsGameVariantData,
    EstimateOpinionsGameSubmission,
    EstimateOpinionsGamePlayerResult
> {
    variantData: EstimateOpinionsGameVariantData;

    calculateResults(submissions: EstimateOpinionsGameSubmission[]): MinigameResult<EstimateOpinionsGamePlayerResult> {
        const playersTotal = submissions.length;
        const playersWithOpinionA = submissions.filter(s => s.choseOptionA).length;
        const percentageWithOpinionA = playersWithOpinionA / playersTotal;
        const playerData = submissions.map(submission => {
            return {
                playerId: submission.playerId,
                chosenOption: submission.choseOptionA ? this.variantData.optionA : this.variantData.optionB,
                estimatedPercentageWithSameOpinion: submission.estimatedPercentageWithSameOpinion,
                realPercentageWithSameOpinion: submission.choseOptionA ? percentageWithOpinionA : 1 - percentageWithOpinionA
            }
        })

        const scoresByPlayerId = playerData.map(player => {
            return {
                ...player,
                offset: Math.abs(player.estimatedPercentageWithSameOpinion - player.realPercentageWithSameOpinion)
            };
        })
            .sort((a, b) => b.offset - a.offset);

        let lastOffset = 99;
        let currentPlacement = 0;
        let peopleWithCurrentPlacementSoFar = 1;
        let resultsByPlayerId: Record<string, EstimateOpinionsGamePlayerResult> = {};
        for (const score of scoresByPlayerId) {
            if (score.offset == lastOffset) {
                resultsByPlayerId[score.playerId] = {...score, placement: currentPlacement};
                peopleWithCurrentPlacementSoFar++;
            } else {
                lastOffset = score.offset;
                const newPlace = currentPlacement + peopleWithCurrentPlacementSoFar
                resultsByPlayerId[score.playerId] = {...score, placement: newPlace};
                currentPlacement = newPlace
                peopleWithCurrentPlacementSoFar = 1;
            }
        }
        return {resultsByPlayerId: resultsByPlayerId};
    }

    provideData(): EstimateOpinionsGameVariantData {
        return undefined;
    }

}