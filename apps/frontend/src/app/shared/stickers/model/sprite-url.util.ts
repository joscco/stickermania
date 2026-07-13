/**
 * Utilities for resolving sticker imageUrls that reference the SVG sprite.
 *
 * The sprite is loaded once and injected as an inline <svg> into the document
 * so that <use href="#symbol-id"> references work instantly after preload.
 */

/**
 * Extracts the sprite fragment id from a sprite URL.
 * "sprite:#sticker-eye-round" → "sticker-eye-round"
 */
export function getSpriteId(imageUrl: string): string {
    return imageUrl.replace('sprite:#', '');
}

/** Fallback path to the global sprite file, relative to the app root. */
export const SPRITE_PATH = 'assets/sprite.svg';
const SPRITE_MANIFEST_PATH = 'assets/sprite-manifest.json';

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
let _spritePathPromise: Promise<string> | null = null;
let _spriteInjected = false;

async function resolveSpritePath(): Promise<string> {
    if (_spritePathPromise) return _spritePathPromise;
    _spritePathPromise = (async () => {
        try {
            const res = await fetch(SPRITE_MANIFEST_PATH, {cache: 'no-store'});
            if (!res.ok) return SPRITE_PATH;
            const manifest = await res.json() as {sprite?: unknown};
            return typeof manifest.sprite === 'string' && manifest.sprite.trim()
                ? manifest.sprite
                : SPRITE_PATH;
        } catch {
            return SPRITE_PATH;
        }
    })();
    return _spritePathPromise;
}

async function fetchSpriteSvgText(): Promise<string> {
    if (_cachedSpriteText) return _cachedSpriteText;
    if (_spriteLoadPromise) return _spriteLoadPromise;

    _spriteLoadPromise = (async () => {
        const spritePath = await resolveSpritePath();
        // Try Cache API first (pre-warmed by service worker).
        try {
            const cache = await caches.open('sprite-v3');
            const cached = await cache.match(spritePath);
            if (cached && cached.ok) {
                _cachedSpriteText = await cached.text();
                return _cachedSpriteText;
            }
        } catch {}

        const res = await fetch(spritePath);
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
    const viewBox = vb ? parseSvgViewBox(vb) : null;
    return viewBox ? { width: viewBox.width, height: viewBox.height } : null;
}

export function getSpriteSymbolSvg(imageUrl: string): string | null {
    const doc = getCachedSpriteDoc();
    if (!doc) return null;

    const id = getSpriteId(imageUrl);
    const symbol = doc.getElementById(id);
    const viewBox = symbol?.getAttribute("viewBox");
    const parsedViewBox = viewBox ? parseSvgViewBox(viewBox) : null;
    if (!symbol || !viewBox || !parsedViewBox) return null;

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pathNumber(parsedViewBox.width)}" height="${pathNumber(parsedViewBox.height)}" viewBox="${escapeXmlAttribute(viewBox)}" color="#000" fill="#000" stroke="#000">`,
        symbol.innerHTML,
        "</svg>",
    ].join("");
}

function parseSvgViewBox(viewBox: string): {minX: number; minY: number; width: number; height: number} | null {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length < 4 || parts.some(part => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) {
        return null;
    }

    return {minX: parts[0], minY: parts[1], width: parts[2], height: parts[3]};
}

function pathNumber(value: number): string {
    return String(Math.round(value * 1000) / 1000);
}

function escapeXmlAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
