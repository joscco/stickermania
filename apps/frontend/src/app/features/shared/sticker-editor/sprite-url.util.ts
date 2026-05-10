/**
 * Utilities for resolving sticker imageUrls that reference the SVG sprite.
 *
 * The sprite is loaded once and injected as an inline <svg> into the document
 * so that <use href="#symbol-id"> references work instantly and offline.
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
 * After the sprite is injected inline, local fragment IDs (#id) work.
 * Before injection, falls back to the external file reference.
 */
export function getSpriteHref(imageUrl: string): string {
    if (_spriteInjected) {
        return `#${getSpriteId(imageUrl)}`;
    }
    return `${SPRITE_PATH}#${getSpriteId(imageUrl)}`;
}

// ── Sprite loading & injection ─────────────────────────────────────────────

let _cachedSpriteText: string | null = null;
let _cachedSpriteDoc: Document | null = null;
let _spriteLoadPromise: Promise<string> | null = null;
let _spriteInjected = false;

async function fetchSpriteSvgText(): Promise<string> {
    if (_cachedSpriteText) return _cachedSpriteText;
    if (_spriteLoadPromise) return _spriteLoadPromise;

    _spriteLoadPromise = (async () => {
        // Try Cache API first (pre-warmed by service worker).
        try {
            const cache = await caches.open('sprite-v1');
            const cached = await cache.match(SPRITE_PATH);
            if (cached && cached.ok) {
                _cachedSpriteText = await cached.text();
                return _cachedSpriteText;
            }
        } catch {}

        const res = await fetch(SPRITE_PATH);
        if (!res.ok) throw new Error(`Failed to load sprite: ${res.status}`);
        _cachedSpriteText = await res.text();
        return _cachedSpriteText;
    })();

    return _spriteLoadPromise;
}

function injectSpriteInline(): void {
    if (_spriteInjected || !_cachedSpriteText) return;
    const container = document.createElement('div');
    container.style.display = 'none';
    container.setAttribute('aria-hidden', 'true');
    container.innerHTML = _cachedSpriteText;

    // Ensure it's an actual <svg> element
    const svg = container.querySelector('svg');
    if (svg) {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.removeAttribute('style');
        svg.style.position = 'absolute';
        svg.style.width = '0';
        svg.style.height = '0';
        svg.style.overflow = 'hidden';
        document.body.appendChild(svg);
        _spriteInjected = true;
    }
}

function getCachedSpriteDoc(): Document | null {
    if (_cachedSpriteDoc) return _cachedSpriteDoc;
    if (!_cachedSpriteText) return null;
    _cachedSpriteDoc = new DOMParser().parseFromString(_cachedSpriteText, 'image/svg+xml');
    return _cachedSpriteDoc;
}

/**
 * Kick off sprite loading and inject it inline.
 * Call once at app init. Returns a promise that resolves when the sprite is ready.
 */
export async function preloadSprite(): Promise<void> {
    await fetchSpriteSvgText();
    getCachedSpriteDoc();
    injectSpriteInline();
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