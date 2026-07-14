import type {StickerPlacement, StickerDefinition} from '@stickermania/shared';
import {BoundingBox} from '../../model/types';
import {stickerIntrinsicSize} from '../../model/sticker-intrinsic-size';
import {outsetNormalizedBounds, STICKER_ALPHA_MASK_OUTSET_PX} from '../../model/sticker-alpha-mask';

export type StickerOverlayGeometry = {
  box: BoundingBox;
  rotationOrigin: {x: number; y: number};
};

export function effectiveScaleX(p: StickerPlacement): number {
  return (p.flipX ? -1 : 1) * p.scale * (p.scaleX ?? 1);
}

export function effectiveScaleY(p: StickerPlacement): number {
  return (p.flipY ? -1 : 1) * p.scale * (p.scaleY ?? 1);
}

export function stickerRenderedSize(_p: Partial<StickerPlacement> | null | undefined, def: StickerDefinition | undefined, stickerSizePx: number): {width: number; height: number} {
  if (!def) return {width: stickerSizePx, height: stickerSizePx};
  const intrinsicSize = stickerIntrinsicSize(def);
  if (!intrinsicSize || intrinsicSize.height <= 0) return {width: stickerSizePx, height: stickerSizePx};
  return {width: Math.round(stickerSizePx * intrinsicSize.width / intrinsicSize.height), height: stickerSizePx};
}

export function stickerTransform(p: StickerPlacement, def?: StickerDefinition, sizePx?: number): string {
  const sx = effectiveScaleX(p);
  const sy = effectiveScaleY(p);
  return `rotate(${p.rotation}deg) scale(${sx}, ${sy})`;
}

export function overlayBox(p: StickerPlacement, def: StickerDefinition | undefined, stickerSizePx: number): BoundingBox | null {
  return overlayGeometry(p, def, stickerSizePx, null)?.box ?? null;
}

export function overlayGeometry(
  p: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
  normalizedBounds: BoundingBox | null,
): StickerOverlayGeometry | null {
  const ob = def?.overlayBounds;
  const size = stickerRenderedSize(p, def, stickerSizePx);
  const sx = effectiveScaleX(p);
  const sy = effectiveScaleY(p);
  if (sx === 0 || sy === 0) return null;

  const pivotX = (ob?.x ?? 0.5) * size.width;
  const pivotY = (ob?.y ?? 0.5) * size.height;
  const bounds = outsetNormalizedBounds(
    normalizedBounds ?? normalizedBoundsFromOverlayBounds(ob),
    STICKER_ALPHA_MASK_OUTSET_PX,
    size.width,
    size.height,
  ) ?? {x: 0, y: 0, w: 1, h: 1};
  const boundsLeft = bounds.x * size.width;
  const boundsRight = (bounds.x + bounds.w) * size.width;
  const boundsTop = bounds.y * size.height;
  const boundsBottom = (bounds.y + bounds.h) * size.height;
  const left = Math.min((boundsLeft - pivotX) * sx, (boundsRight - pivotX) * sx);
  const right = Math.max((boundsLeft - pivotX) * sx, (boundsRight - pivotX) * sx);
  const top = Math.min((boundsTop - pivotY) * sy, (boundsBottom - pivotY) * sy);
  const bottom = Math.max((boundsTop - pivotY) * sy, (boundsBottom - pivotY) * sy);
  const box = {
    x: p.x + left,
    y: p.y + top,
    w: right - left,
    h: bottom - top,
  };

  return {
    box,
    rotationOrigin: {x: p.x, y: p.y},
  };
}

export function normalizedBoundsFromOverlayBounds(
  overlayBounds: StickerDefinition["overlayBounds"] | undefined,
): BoundingBox | null {
  return overlayBounds
    ? {
      x: overlayBounds.x - overlayBounds.w / 2,
      y: overlayBounds.y - overlayBounds.h / 2,
      w: overlayBounds.w,
      h: overlayBounds.h,
    }
    : null;
}
