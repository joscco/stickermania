import type {BoardStickerPlacement, StickerDefinition} from "@stickermania/shared";
import {overlayBox} from '../../placement-canvas/rendering/sticker-transform.util';
import {BoardBounds} from '../geometry/sticker-board-types';

export type PlacementBadge = {
  name: string;
  avatarUrl: string | null;
};

export type PlacementLabel = {
  instanceId: string;
  name: string;
  avatarUrl: string | null;
  centerX: number;
  centerY: number;
  arrowRotation: number;
};

export type BuildPlacementLabelsOptions = {
  placements: BoardStickerPlacement[];
  stickerCatalog: StickerDefinition[];
  placementBadges: Record<string, PlacementBadge>;
  bounds: BoardBounds;
  boardWidth: number;
  boardHeight: number;
  stickerBaseSize: number;
  labelSafeSize?: number;
  badgeGap?: number;
};

type Rect = {x: number; y: number; w: number; h: number};

type LabelCandidate = {
  centerX: number;
  centerY: number;
  score: number;
};

type PlacementLabelSource = {
  placement: BoardStickerPlacement;
  badge: PlacementBadge;
  localPlacement: BoardStickerPlacement;
  rect: Rect;
};

type StickerObstacle = {
  instanceId: string;
  rect: Rect;
};

const DEFAULT_LABEL_SAFE_SIZE = 58;
const DEFAULT_BADGE_GAP = 12;
const BADGE_DIRECTIONS = [
  {x: 0, y: -1},
  {x: 0.82, y: -0.58},
  {x: 1, y: 0},
  {x: 0.82, y: 0.58},
  {x: 0, y: 1},
  {x: -0.82, y: 0.58},
  {x: -1, y: 0},
  {x: -0.82, y: -0.58},
];

export function buildPlacementLabels(options: BuildPlacementLabelsOptions): PlacementLabel[] {
  const badges = options.placementBadges;
  const catalog = new Map(options.stickerCatalog.map(sticker => [sticker.id, sticker]));
  const obstacles = options.placements.map((placement): {placement: BoardStickerPlacement; localPlacement: BoardStickerPlacement; rect: Rect} => {
    const localPlacement = {
      ...placement,
      x: placement.x - options.bounds.minX,
      y: placement.y - options.bounds.minY,
    };
    const sticker = catalog.get(placement.stickerId);
    const rect = overlayBox(localPlacement, sticker, options.stickerBaseSize)
      ?? {x: localPlacement.x - 40, y: localPlacement.y - 40, w: 80, h: 80};

    return {placement, localPlacement, rect};
  });
  const stickerObstacles = obstacles.map((obstacle): StickerObstacle => ({
    instanceId: obstacle.placement.instanceId,
    rect: obstacle.rect,
  }));
  const sources = obstacles.flatMap((obstacle): PlacementLabelSource[] => {
    const badge = badges[obstacle.placement.instanceId];
    if (!badge) return [];

    return [{
      placement: obstacle.placement,
      badge,
      localPlacement: obstacle.localPlacement,
      rect: obstacle.rect,
    }];
  });

  const labelRects: Rect[] = [];

  return sources.map((source) => {
    const candidate = bestBadgeCandidate(source, stickerObstacles, labelRects, options);
    labelRects.push(labelSafeRect(candidate.centerX, candidate.centerY, labelSafeSize(options)));

    const deltaX = source.localPlacement.x - candidate.centerX;
    const deltaY = source.localPlacement.y - candidate.centerY;

    return {
      instanceId: source.placement.instanceId,
      name: source.badge.name,
      avatarUrl: source.badge.avatarUrl,
      centerX: candidate.centerX,
      centerY: candidate.centerY,
      arrowRotation: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
    };
  });
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function bestBadgeCandidate(
  source: PlacementLabelSource,
  stickerObstacles: StickerObstacle[],
  labelRects: Rect[],
  options: BuildPlacementLabelsOptions,
): LabelCandidate {
  const start = hashString(source.placement.instanceId) % BADGE_DIRECTIONS.length;
  const candidates = BADGE_DIRECTIONS.map((_, index) => {
    const direction = BADGE_DIRECTIONS[(start + index) % BADGE_DIRECTIONS.length];
    const rawCandidate = badgeCandidateForDirection(source.rect, direction, options);
    const rect = labelSafeRect(rawCandidate.centerX, rawCandidate.centerY, labelSafeSize(options));
    const stickerPenalty = stickerObstacles.reduce((sum, other) => {
      const weight = other.instanceId === source.placement.instanceId ? 0.5 : 4;
      return sum + overlapArea(rect, other.rect) * weight;
    }, 0);
    const labelPenalty = labelRects.reduce((sum, labelRect) => sum + overlapArea(rect, labelRect) * 6, 0);
    const clampPenalty = rawCandidate.clampDistance * 100;

    return {
      centerX: rawCandidate.centerX,
      centerY: rawCandidate.centerY,
      score: stickerPenalty + labelPenalty + clampPenalty + index * 0.01,
    };
  });

  return candidates.reduce((best, candidate) => candidate.score < best.score ? candidate : best);
}

function badgeCandidateForDirection(
  rect: Rect,
  direction: {x: number; y: number},
  options: BuildPlacementLabelsOptions,
): LabelCandidate & {clampDistance: number} {
  const safeSize = labelSafeSize(options);
  const gap = badgeGap(options);
  const rectCenterX = rect.x + rect.w / 2;
  const rectCenterY = rect.y + rect.h / 2;
  const offsetDistance = rectDirectionalRadius(rect, direction) + safeSize / 2 + gap;
  const minCenter = safeSize / 2;
  const maxCenterX = options.boardWidth - safeSize / 2;
  const maxCenterY = options.boardHeight - safeSize / 2;
  const rawX = rectCenterX + direction.x * offsetDistance;
  const rawY = rectCenterY + direction.y * offsetDistance;
  const centerX = clamp(minCenter, rawX, maxCenterX);
  const centerY = clamp(minCenter, rawY, maxCenterY);

  return {
    centerX,
    centerY,
    score: 0,
    clampDistance: Math.hypot(centerX - rawX, centerY - rawY),
  };
}

function labelSafeRect(centerX: number, centerY: number, safeSize: number): Rect {
  return {
    x: centerX - safeSize / 2,
    y: centerY - safeSize / 2,
    w: safeSize,
    h: safeSize,
  };
}

function labelSafeSize(options: BuildPlacementLabelsOptions): number {
  return options.labelSafeSize ?? DEFAULT_LABEL_SAFE_SIZE;
}

function badgeGap(options: BuildPlacementLabelsOptions): number {
  return options.badgeGap ?? DEFAULT_BADGE_GAP;
}

function rectDirectionalRadius(rect: Rect, direction: {x: number; y: number}): number {
  const xRadius = Math.abs(direction.x) > 0.001 ? rect.w / 2 / Math.abs(direction.x) : Number.POSITIVE_INFINITY;
  const yRadius = Math.abs(direction.y) > 0.001 ? rect.h / 2 / Math.abs(direction.y) : Number.POSITIVE_INFINITY;
  return Math.min(xRadius, yRadius);
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
