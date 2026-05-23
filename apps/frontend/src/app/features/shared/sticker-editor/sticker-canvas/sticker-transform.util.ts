import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {getSpriteViewBox} from '../sprite-url.util';
import type {BoundingBox} from '../types';

const CENTERED_BOUNDS = {
  x: 0.5,
  y: 0.5,
  w: 1,
  h: 1,
}

/** Compute the element-local anchor point from overlayBounds (falls back to center). */
export function stickerAnchor(
  placement: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
): string {
  const ob = def?.overlayBounds;
  if (!ob) {
    return '50% 50%';
  }
  const size = stickerRenderedSize(placement, def, stickerSizePx);
  return `${ob.x * size.width}px ${ob.y * size.height}px`;
}

/** Compute the CSS left position, compensating for overlay anchor offset. */
export function stickerLeft(
  placement: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
): number {
  const ob = def?.overlayBounds;
  if (!ob) {
    return placement.x;
  }
  const size = stickerRenderedSize(placement, def, stickerSizePx);
  return placement.x - ob.x * size.width;
}

/** Compute the CSS top position, compensating for overlay anchor offset. */
export function stickerTop(
  placement: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
): number {
  const ob = def?.overlayBounds;
  if (!ob) {
    return placement.y;
  }
  const size = stickerRenderedSize(placement, def, stickerSizePx);
  return placement.y - ob.y * size.height;
}

/** Compute the CSS transform string. */
export function stickerTransform(placement: StickerPlacement, def?: StickerDefinition, stickerSizePx?: number): string {
  const sx = effectiveScaleX(placement);
  const sy = effectiveScaleY(placement);
  const ob = def?.overlayBounds;
  if (ob && stickerSizePx != null) {
    const size = stickerRenderedSize(placement, def, stickerSizePx);
    return `rotate(${placement.rotation}deg) scale(${sx}, ${sy}) translate(${-ob.x * size.width}px, ${-ob.y * size.height}px)`;
  }
  return `rotate(${placement.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
}

/** Compute the overlay bounding box (axis-aligned, size from hitbox/overlayBounds). */
export function overlayBox(
  placement: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
): BoundingBox | null {
  const overlayBounds = def?.overlayBounds ?? CENTERED_BOUNDS;
  const size = stickerRenderedSize(placement, def, stickerSizePx);
  const sx = effectiveScaleX(placement);
  const sy = effectiveScaleY(placement);

  let ow: number, oh: number, ox: number, oy: number;
  ow = Math.max(40, Math.abs(overlayBounds.w * size.width * sx));
  oh = Math.max(40, Math.abs(overlayBounds.h * size.height * sy));
  ox = placement.x + (overlayBounds.x - 0.5) * size.width * sx;
  oy = placement.y + (overlayBounds.y - 0.5) * size.height * sy;

  return {x: ox - ow / 2, y: oy - oh / 2, w: ow, h: oh};
}

export function effectiveScaleX(p: StickerPlacement): number {
  return (p.flipX ? -1 : 1) * p.scale * ((p as any).scaleX ?? 1);
}

export function effectiveScaleY(p: StickerPlacement): number {
  return (p.flipY ? -1 : 1) * p.scale * ((p as any).scaleY ?? 1);
}

export function stickerRenderedSize(
  _placement: StickerPlacement,
  def: StickerDefinition | undefined,
  stickerSizePx: number,
): { width: number; height: number } {
  if (!def) {
    return {width: stickerSizePx, height: stickerSizePx};
  }
  const vb = getSpriteViewBox(def.imageUrl);
  if (!vb || vb.height <= 0) {
    return {width: stickerSizePx, height: stickerSizePx};
  }
  return {width: Math.round(stickerSizePx * vb.width / vb.height), height: stickerSizePx};
}
