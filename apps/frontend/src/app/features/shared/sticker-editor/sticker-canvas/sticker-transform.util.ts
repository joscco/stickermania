import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {getSpriteViewBox} from '../sprite-url.util';
import type {BoundingBox} from '../types';

export function effectiveScaleX(p: StickerPlacement): number {
  return (p.flipX ? -1 : 1) * p.scale * ((p as any).scaleX ?? 1);
}

export function effectiveScaleY(p: StickerPlacement): number {
  return (p.flipY ? -1 : 1) * p.scale * ((p as any).scaleY ?? 1);
}

export function stickerRenderedSize(_p: StickerPlacement, def: StickerDefinition | undefined, stickerSizePx: number): {width: number; height: number} {
  if (!def) return {width: stickerSizePx, height: stickerSizePx};
  const vb = getSpriteViewBox(def.imageUrl);
  if (!vb || vb.height <= 0) return {width: stickerSizePx, height: stickerSizePx};
  return {width: Math.round(stickerSizePx * vb.width / vb.height), height: stickerSizePx};
}

export function stickerTransform(_p: StickerPlacement, _def?: StickerDefinition, _sizePx?: number): string {
  return `translate(-50%, -50%)`;
}

export function stickerAnchor(_def?: StickerDefinition, _sizePx?: number): string {
  return '50% 50%';
}

export function stickerLeft(p: StickerPlacement, _def?: StickerDefinition, _sizePx?: number): number {
  return p.x;
}

export function stickerTop(p: StickerPlacement, _def?: StickerDefinition, _sizePx?: number): number {
  return p.y;
}

export function overlayBox(p: StickerPlacement, def: StickerDefinition | undefined, stickerSizePx: number): BoundingBox | null {
  const ob = def?.overlayBounds;
  const size = stickerRenderedSize(p, def, stickerSizePx);
  const sx = effectiveScaleX(p);
  const sy = effectiveScaleY(p);

  let ow: number, oh: number, ox: number, oy: number;
  if (ob) {
    ow = Math.max(40, Math.abs(ob.w * size.width * sx));
    oh = Math.max(40, Math.abs(ob.h * size.height * sy));
    ox = p.x;
    oy = p.y;
  } else {
    const hp = def?.hitboxPolygon;
    if (!hp || hp.length < 3) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of hp) {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }
    ow = Math.max(40, Math.abs((maxX - minX) * size.width * sx));
    oh = Math.max(40, Math.abs((maxY - minY) * size.height * sy));
    ox = p.x; oy = p.y;
  }
  return {x: ox - ow / 2, y: oy - oh / 2, w: ow, h: oh};
}
