import type {MinigameFrontendDefinition} from "../frontend-definition";
import {getPayloadObject} from "../frontend-definition";
import {EstimateOpinionsGame} from "./game";
import type {
    EstimateOpinionsSubmission,
    EstimateOpinionsVariantData,
} from "./game";
import {EstimateOpinionsPhaseComponent} from "./player-ui/phase-0-estimate/estimate-opinions-phase.component";
import {EstimateOpinionsResultComponent} from "./player-ui/result/estimate-opinions-result.component";
import {EstimateOpinionsDraft} from "./player-ui/ui-contract";
import {ESTIMATE_OPINIONS_VARIANTS} from "./variants";

export const ESTIMATE_OPINIONS_FRONTEND_DEFINITION: MinigameFrontendDefinition<
    EstimateOpinionsVariantData,
    EstimateOpinionsDraft,
    EstimateOpinionsSubmission
> = {
    type: "estimate-opinions",
    label: "Estimate Opinions",
    phaseComponent: EstimateOpinionsPhaseComponent,
    resultComponent: EstimateOpinionsResultComponent,
    variants: ESTIMATE_OPINIONS_VARIANTS,
    taskFromVariant: (variant) => ({
        id: variant.id,
        type: "estimate-opinions",
        title: variant.title,
        durationSec: variant.firstRoundSeconds,
        variantData: variant,
    }),
    variantFromTask: (task) => {
        const variantData = task["variantData"];
        if (isEstimateOpinionsVariantData(variantData)) return variantData;

        return {
            id: task.id,
            title: task.title,
            firstRoundSeconds: Number(task.durationSec ?? 45),
            question: task.title,
            optionA: String(task["optionA"] ?? "Ja"),
            optionB: String(task["optionB"] ?? "Nein"),
        };
    },
    variantMeta: (variant) => `${variant.optionA} / ${variant.optionB} · Runde ${variant.firstRoundSeconds}s`,
    initialDraft: () => ({
        choseOptionA: null,
        estimatedPercentageWithSameOpinion: 0.5,
    }),
    reducePlayerEvent: (event, currentDraft) => {
        const e = event as { type?: unknown; draft?: unknown };
        return e.type === "draft-change" && isEstimateOpinionsDraft(e.draft)
            ? e.draft
            : currentDraft;
    },
    canSubmit: (draft) => draft.choseOptionA !== null,
    createSubmitPayload: (draft) => draft,
    createEditorSubmission: (playerId, draft) =>
        draft.choseOptionA === null
            ? null
            : {
                playerId,
                choseOptionA: draft.choseOptionA,
                estimatedPercentageWithSameOpinion: clampPercentage(
                    draft.estimatedPercentageWithSameOpinion,
                ),
            },
    createSampleSubmission: (playerId, playerIndex) => {
        const samples = [
            {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.75},
            {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.5},
            {choseOptionA: false, estimatedPercentageWithSameOpinion: 0.25},
            {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.9},
        ];
        return {playerId, ...(samples[playerIndex] ?? samples[0])};
    },
    calculateResults: (submissions, variant) =>
        new EstimateOpinionsGame(variant).calculateResults(submissions),
    createPlayState: (args) => ({
        playerId: args.playerId,
        phase: "estimate",
        variantData: ESTIMATE_OPINIONS_FRONTEND_DEFINITION.variantFromTask(args.task),
        ownSubmission: args.ownSubmission,
        draft: args.draft,
        ownResult: args.ownResult,
        roundEndsAt: args.roundEndsAt,
        serverNow: args.serverNow,
    }),
    createResultState: (args) => {
        const payload = getPayloadObject(args.ownSubmission);
        const choseOptionA = payload?.["choseOptionA"];
        const estimatedPercentageWithSameOpinion = Number(
            payload?.["estimatedPercentageWithSameOpinion"],
        );

        return {
            playerId: args.playerId,
            phase: "result",
            variantData: ESTIMATE_OPINIONS_FRONTEND_DEFINITION.variantFromTask(args.task),
            ownSubmission:
                typeof choseOptionA === "boolean" &&
                Number.isFinite(estimatedPercentageWithSameOpinion)
                    ? {
                        playerId: args.playerId,
                        choseOptionA,
                        estimatedPercentageWithSameOpinion,
                    }
                    : undefined,
            ownResult: args.ownResult,
            roundEndsAt: args.roundEndsAt,
            serverNow: args.serverNow,
        };
    },
    scoringInfo: () => "Schätze deine eigene Zustimmungsgruppe - am nächsten dran gewinnt",
    draftLabel: (draft, variant) => {
        if (draft.choseOptionA === null) return null;
        return `${draft.choseOptionA ? variant.optionA : variant.optionB}, ${Math.round(draft.estimatedPercentageWithSameOpinion * 100)}% bereit`;
    },
    submissionLabel: (submission, variant) =>
        `${submission.choseOptionA ? variant.optionA : variant.optionB}, ${Math.round(submission.estimatedPercentageWithSameOpinion * 100)}%`,
    resultDetail: (result) => {
        const estimateResult = result as {
            chosenOption?: string;
            estimatedPercentageWithSameOpinion?: number;
        };
        return `${estimateResult.chosenOption ?? ""} · ${Math.round((estimateResult.estimatedPercentageWithSameOpinion ?? 0) * 100)}%`;
    },
    resultValue: (result) => {
        const estimateResult = result as { deviationPercentagePoints?: number };
        return `${(estimateResult.deviationPercentagePoints ?? 0).toFixed(1)} %.`;
    },
    resultUnitLabel: () => "daneben",
    resultSummary: ({submission, result}) => {
        const estimateResult = result as {
            chosenOption?: string;
            estimatedPercentageWithSameOpinion?: number;
            realPercentageWithSameOpinion?: number;
        } | undefined;
        if (!submission || !estimateResult) return "";
        if (
            estimateResult.chosenOption &&
            typeof estimateResult.estimatedPercentageWithSameOpinion === "number" &&
            typeof estimateResult.realPercentageWithSameOpinion === "number"
        ) {
            return `${estimateResult.chosenOption}: ${Math.round(estimateResult.estimatedPercentageWithSameOpinion * 100)}% geschaetzt, ${Math.round(estimateResult.realPercentageWithSameOpinion * 100)}% tatsaechlich.`;
        }
        return "";
    },
};

function isEstimateOpinionsVariantData(value: unknown): value is EstimateOpinionsVariantData {
    const variant = value as Partial<EstimateOpinionsVariantData> | null;
    return !!variant &&
        typeof variant.id === "string" &&
        typeof variant.title === "string" &&
        typeof variant.firstRoundSeconds === "number" &&
        typeof variant.question === "string" &&
        typeof variant.optionA === "string" &&
        typeof variant.optionB === "string";
}

function isEstimateOpinionsDraft(value: unknown): value is EstimateOpinionsDraft {
    const draft = value as Partial<EstimateOpinionsDraft> | null;
    return !!draft &&
        (draft.choseOptionA === null || typeof draft.choseOptionA === "boolean") &&
        typeof draft.estimatedPercentageWithSameOpinion === "number";
}

function clampPercentage(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}
