/**
 * Utilities for resolving sticker imageUrls that reference the SVG sprite.
 *
 * Usage in templates:
 *   <app-sticker-img [imageUrl]="sticker.imageUrl" class="w-10 h-10"/>
 */

/**
 * Extracts the sprite fragment id from a sprite URL.
 * "sprite:#sticker-eye-round" → "sticker-eye-round"
 */
export function getSpriteId(imageUrl: string): string {
    return imageUrl.replace('sprite:#', '');
}

/** The path to the global sprite file, relative to the app root. */
export const SPRITE_PATH = 'assets/sprite.svg';

/**
 * Returns the full href for use in <use href="...">.
 * "sprite:#sticker-eye-round" → "assets/sprite.svg#sticker-eye-round"
 */
export function getSpriteHref(imageUrl: string): string {
    return `${SPRITE_PATH}#${getSpriteId(imageUrl)}`;
}

// ── Sprite → loadable URL ────────────────────────────────────────────────────

let _cachedSpriteText: string | null = null;
let _cachedSpriteDoc: Document | null = null;

async function fetchSpriteSvgText(): Promise<string> {
    if (_cachedSpriteText) return _cachedSpriteText;
    const res = await fetch(SPRITE_PATH);
    _cachedSpriteText = await res.text();
    return _cachedSpriteText;
}

function getCachedSpriteDoc(): Document | null {
    if (_cachedSpriteDoc) return _cachedSpriteDoc;
    if (!_cachedSpriteText) return null;
    _cachedSpriteDoc = new DOMParser().parseFromString(_cachedSpriteText, 'image/svg+xml');
    return _cachedSpriteDoc;
}

/**
 * Kick off sprite loading so the cached doc is ready for synchronous lookups.
 * Call once at app init or component init.
 */
export async function preloadSprite(): Promise<void> {
    await fetchSpriteSvgText();
    getCachedSpriteDoc();
}

/**
 * Synchronously returns the intrinsic {width, height} for a sprite symbol
 * based on its viewBox. Returns null if the sprite hasn't been loaded yet.
 */
export function getSpriteViewBox(imageUrl: string): { width: number; height: number } | null {
    const doc = getCachedSpriteDoc();
    if (!doc) return null;
    const id = getSpriteId(imageUrl);
    const symbol = doc.getElementById(id);
    const vb = symbol?.getAttribute('viewBox');
    if (!vb) return null;
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length < 4 || parts[2] <= 0 || parts[3] <= 0) return null;
    return { width: parts[2], height: parts[3] };
}

/**
 * Resolves a sprite URL to a blob URL with the correct intrinsic dimensions.
 *
 * All stickers now use sprite: URLs exclusively.
 *
 * `intrinsicWidth` / `intrinsicHeight` are derived from the symbol's viewBox.
 */
export async function resolveToImgUrl(
    imageUrl: string,
    size = 128,
): Promise<{ url: string; intrinsicWidth: number | null; intrinsicHeight: number | null }> {
    const id = getSpriteId(imageUrl);
    await fetchSpriteSvgText();
    const doc = getCachedSpriteDoc()!;
    const symbol = doc.getElementById(id) as SVGSymbolElement | null;

    const viewBox = symbol?.getAttribute('viewBox') ?? `0 0 ${size} ${size}`;
    const inner = symbol?.innerHTML ?? '';

    // Parse viewBox to get the true aspect ratio
    const vbParts = viewBox.trim().split(/[\s,]+/).map(Number);
    const vbW = vbParts.length >= 4 ? vbParts[2] : size;
    const vbH = vbParts.length >= 4 ? vbParts[3] : size;

    // Render at the correct aspect ratio
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${vbW}" height="${vbH}">${inner}</svg>`;
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    return {
        url: URL.createObjectURL(blob),
        intrinsicWidth: vbW,
        intrinsicHeight: vbH,
    };
}

