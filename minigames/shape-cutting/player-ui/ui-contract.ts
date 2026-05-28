import type {
  CutLine,
  Point,
} from "../geometry";
import type {
  ShapeCuttingPlayerResult,
  ShapeCuttingSubmission,
  ShapeCuttingVariantData,
} from "../game";

export interface ShapeCuttingDraft {
  lines: CutLine[];
}

export interface ShapeCuttingPlayerUiState {
  playerId: string;
  phase: "cut" | "result";
  variantData: ShapeCuttingVariantData;
  ownSubmission?: ShapeCuttingSubmission;
  draft?: ShapeCuttingDraft;
  ownResult?: ShapeCuttingPlayerResult;
  roundEndsAt: number;
  serverNow: number;
}

export interface ShapeCuttingEditorState {
  variant: ShapeCuttingVariantData;
}

export type ShapeCuttingPlayerUiEvent = {
  type: "draft-change";
  playerId: string;
  draft: ShapeCuttingDraft;
};

export type ShapeCuttingEditorEvent =
  | {
      type: "variant-change";
      variant: ShapeCuttingVariantData;
    }
  | {
      type: "polygon-point-change";
      pointIndex: number;
      point: Point;
    };
