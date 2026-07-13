import type {BoardStickerPlacement} from "@birthday/shared";

export type BoardPlacementPatch = {
  upserts: BoardStickerPlacement[];
  deletes: string[];
};

export function boardPlacementListSignature(placements: BoardStickerPlacement[]): string {
  return JSON.stringify([...placements]
    .map(placement => boardPlacementComparable(placement))
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId)));
}

export function boardPlacementSignature(placement: BoardStickerPlacement | undefined): string {
  if (!placement) return "";
  return JSON.stringify(boardPlacementComparable(placement));
}

export function diffBoardPlacementPatch(
  previousPlacements: BoardStickerPlacement[],
  nextPlacements: BoardStickerPlacement[],
  includePlacement: (placement: BoardStickerPlacement) => boolean = () => true,
): BoardPlacementPatch {
  const previous = new Map(previousPlacements
    .filter(includePlacement)
    .map(placement => [placement.instanceId, placement]));
  const next = new Map(nextPlacements
    .filter(includePlacement)
    .map(placement => [placement.instanceId, placement]));

  return {
    upserts: [...next.values()].filter(placement =>
      boardPlacementSignature(previous.get(placement.instanceId)) !== boardPlacementSignature(placement)),
    deletes: [...previous.keys()].filter(instanceId => !next.has(instanceId)),
  };
}

export function mergeIncomingWithLocalBoardPatch(
  incomingPlacements: BoardStickerPlacement[],
  localPlacements: BoardStickerPlacement[],
  isLocalPlacement: (placement: BoardStickerPlacement) => boolean,
): BoardStickerPlacement[] {
  const local = localPlacements.filter(isLocalPlacement);
  const localIds = new Set(local.map(placement => placement.instanceId));
  const incomingWithoutLocal = incomingPlacements.filter(placement => !localIds.has(placement.instanceId));

  return [...incomingWithoutLocal.map(placement => ({...placement})), ...local.map(placement => ({...placement}))]
    .sort((left, right) => left.zIndex - right.zIndex);
}

type ComparableBoardPlacement = {
  instanceId: string;
  stickerId: string;
  ownerPlayerId: string;
  placedByPlayerId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  scaleX: number | undefined;
  scaleY: number | undefined;
  flipX: boolean;
  flipY: boolean;
  zIndex: number;
  locked: boolean;
};

function boardPlacementComparable(placement: BoardStickerPlacement): ComparableBoardPlacement {
  return {
    instanceId: placement.instanceId,
    stickerId: placement.stickerId,
    ownerPlayerId: placement.ownerPlayerId,
    placedByPlayerId: placement.placedByPlayerId,
    x: Math.round(placement.x * 100) / 100,
    y: Math.round(placement.y * 100) / 100,
    rotation: Math.round(placement.rotation * 100) / 100,
    scale: Math.round(placement.scale * 1000) / 1000,
    scaleX: placement.scaleX === undefined ? undefined : Math.round(placement.scaleX * 1000) / 1000,
    scaleY: placement.scaleY === undefined ? undefined : Math.round(placement.scaleY * 1000) / 1000,
    flipX: !!placement.flipX,
    flipY: !!placement.flipY,
    zIndex: placement.zIndex,
    locked: !!(placement as BoardStickerPlacement & {locked?: boolean}).locked,
  };
}
