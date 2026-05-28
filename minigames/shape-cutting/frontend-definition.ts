import type {MinigameTask} from "@birthday/shared";
import type {MinigameFrontendDefinition} from "../frontend-definition";
import {getPayloadObject} from "../frontend-definition";
import {CutLine, Point} from "./geometry";
import {ShapeCuttingEditorComponent} from "./editor/shape-cutting-editor.component";
import {ShapeCuttingGame} from "./game";
import type {
  ShapeCuttingPlayerResult,
  ShapeCuttingSubmission,
  ShapeCuttingVariantData,
} from "./game";
import {ShapeCuttingPhaseComponent} from "./player-ui/phase-cut/shape-cutting-phase.component";
import {ShapeCuttingResultComponent} from "./player-ui/result/shape-cutting-result.component";
import {ShapeCuttingDraft} from "./player-ui/ui-contract";
import {initialCutLines} from "./player-ui/shape-cutting-view.util";
import {SHAPE_CUTTING_VARIANTS} from "./variants";

export const SHAPE_CUTTING_FRONTEND_DEFINITION: MinigameFrontendDefinition<
  ShapeCuttingVariantData,
  ShapeCuttingDraft,
  ShapeCuttingSubmission,
  ShapeCuttingPlayerResult
> = {
  type: "shape-cutting",
  label: "Shape Cutting",
  phaseComponent: ShapeCuttingPhaseComponent,
  resultComponent: ShapeCuttingResultComponent,
  editorComponent: ShapeCuttingEditorComponent,
  variants: SHAPE_CUTTING_VARIANTS,
  taskFromVariant: (variant) => ({
    id: variant.id,
    type: "shape-cutting",
    title: variant.title,
    durationSec: variant.firstRoundSeconds,
    variantData: variant,
  }),
  variantFromTask: (task) => {
    const variantData = task["variantData"];
    if (isShapeCuttingVariantData(variantData)) return variantData;

    return {
      id: task.id,
      title: task.title,
      firstRoundSeconds: Number(task.durationSec ?? 45),
      backgroundSvg: typeof task["backgroundSvg"] === "string" ? task["backgroundSvg"] : null,
      polygon: isPolygon(task["polygon"]) ? task["polygon"] : SHAPE_CUTTING_VARIANTS[0].polygon,
      targetParts: Number(task["targetParts"] ?? 3),
    };
  },
  variantMeta: (variant) => `${variant.targetParts} Teile · ${variant.polygon.length} Punkte · ${variant.firstRoundSeconds}s`,
  initialDraft: () => ({lines: []}),
  reducePlayerEvent: (event, currentDraft) => {
    const e = event as {type?: unknown; draft?: unknown};
    return e.type === "draft-change" && isShapeCuttingDraft(e.draft)
      ? e.draft
      : currentDraft;
  },
  canSubmit: () => true,
  createSubmitPayload: (draft, task) => ({lines: linesForDraft(draft, task)}),
  createEditorSubmission: (playerId, draft, task) => ({
    playerId,
    lines: linesForDraft(draft, task),
  }),
  createSampleSubmission: (playerId, playerIndex, task) => {
    const variant = task ? SHAPE_CUTTING_FRONTEND_DEFINITION.variantFromTask(task) : SHAPE_CUTTING_VARIANTS[0];
    const lines = initialCutLines(variant.targetParts).map((line, index) => ({
      a: {x: line.a.x + playerIndex * 6 - index * 2, y: line.a.y + playerIndex * 4},
      b: {x: line.b.x - playerIndex * 5 + index * 3, y: line.b.y - playerIndex * 3},
    }));
    return {playerId, lines};
  },
  calculateResults: (submissions, variant) =>
    new ShapeCuttingGame(variant).calculateResults(submissions),
  createPlayState: (args) => ({
    playerId: args.playerId,
    phase: "cut",
    variantData: SHAPE_CUTTING_FRONTEND_DEFINITION.variantFromTask(args.task),
    ownSubmission: args.ownSubmission,
    draft: args.draft,
    ownResult: args.ownResult,
    roundEndsAt: args.roundEndsAt,
    serverNow: args.serverNow,
  }),
  createResultState: (args) => {
    const payload = getPayloadObject(args.ownSubmission);
    const lines = parseLines(payload?.["lines"]);

    return {
      playerId: args.playerId,
      phase: "result",
      variantData: SHAPE_CUTTING_FRONTEND_DEFINITION.variantFromTask(args.task),
      ownSubmission: lines ? {playerId: args.playerId, lines} : undefined,
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  createEditorState: (variant) => ({variant}),
  reduceEditorEvent: (event, currentVariant) => {
    const e = event as {type?: unknown; variant?: unknown};
    return e.type === "variant-change" && isShapeCuttingVariantData(e.variant)
      ? e.variant
      : currentVariant;
  },
  scoringInfo: () => "Die gleichmaessigste Flaechenaufteilung gewinnt",
  draftLabel: (draft, variant) => `${linesForDraft(draft, undefined, variant).length} Schnitte bereit`,
  submissionLabel: (submission) => `${submission.lines.length} Schnitte abgegeben`,
  resultDetail: (result) => `${result.pieceCount}/${result.targetParts} Teile`,
  resultValue: (result) => result.deviationPercentagePoints.toFixed(1),
  resultUnitLabel: () => "Punkte",
  resultSummary: ({submission, result}) => {
    const shapeResult = result as ShapeCuttingPlayerResult | undefined;
    if (!submission || !shapeResult) return "";
    return `${shapeResult.pieceCount} Teile, ${shapeResult.deviationPercentagePoints.toFixed(1)} Punkte Abweichung.`;
  },
};

function linesForDraft(
  draft: ShapeCuttingDraft,
  task?: MinigameTask,
  variantOverride?: ShapeCuttingVariantData,
): CutLine[] {
  if (draft.lines.length > 0) return cloneLines(draft.lines);
  const variant = variantOverride ??
    (task ? SHAPE_CUTTING_FRONTEND_DEFINITION.variantFromTask(task) : SHAPE_CUTTING_VARIANTS[0]);
  return initialCutLines(variant.targetParts);
}

function isShapeCuttingVariantData(value: unknown): value is ShapeCuttingVariantData {
  const variant = value as Partial<ShapeCuttingVariantData> | null;
  return !!variant &&
    typeof variant.id === "string" &&
    typeof variant.title === "string" &&
    typeof variant.firstRoundSeconds === "number" &&
    (variant.backgroundSvg === null || typeof variant.backgroundSvg === "string") &&
    typeof variant.targetParts === "number" &&
    isPolygon(variant.polygon);
}

function isShapeCuttingDraft(value: unknown): value is ShapeCuttingDraft {
  const draft = value as Partial<ShapeCuttingDraft> | null;
  return !!draft && parseLines(draft.lines) !== null;
}

function isPolygon(value: unknown): value is Point[] {
  return Array.isArray(value) &&
    value.length >= 3 &&
    value.every((point) =>
      typeof point?.x === "number" &&
      typeof point?.y === "number" &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
    );
}

function parseLines(value: unknown): CutLine[] | null {
  if (!Array.isArray(value)) return null;

  const lines = value
    .map((line) => {
      const entry = line as {a?: unknown; b?: unknown};
      if (!isPoint(entry.a) || !isPoint(entry.b)) return null;
      return {a: entry.a, b: entry.b};
    })
    .filter((line): line is CutLine => line !== null);

  return lines.length === value.length ? cloneLines(lines) : null;
}

function isPoint(value: unknown): value is Point {
  const point = value as Partial<Point> | null;
  return !!point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y);
}

function cloneLines(lines: CutLine[]): CutLine[] {
  return lines.map((line) => ({
    a: {...line.a},
    b: {...line.b},
  }));
}
