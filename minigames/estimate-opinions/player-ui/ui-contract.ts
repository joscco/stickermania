import {
    EstimateOpinionsPlayerResult,
    EstimateOpinionsSubmission,
    EstimateOpinionsVariantData,
} from "../game";

export type EstimateOpinionsPhase = "estimate" | "result";

export interface EstimateOpinionsDraft {
    choseOptionA: boolean | null;
    estimatedPercentageWithSameOpinion: number;
}

export interface EstimateOpinionsPlayerUiState {
    playerId: string;
    phase: EstimateOpinionsPhase;
    variantData: EstimateOpinionsVariantData;
    ownSubmission?: EstimateOpinionsSubmission;
    draft?: EstimateOpinionsDraft;
    ownResult?: EstimateOpinionsPlayerResult;
    roundEndsAt: number;
    serverNow: number;
}

export type EstimateOpinionsPlayerUiEvent =
    | {
    type: "draft-change";
    playerId: string;
    draft: EstimateOpinionsDraft;
}
    | {
    type: "ready-for-next";
    playerId: string;
};
