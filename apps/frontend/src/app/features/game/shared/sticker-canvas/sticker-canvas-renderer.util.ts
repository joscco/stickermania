import type {StickerPlacement} from "@birthday/shared";

/**
 * Renders all sticker placements onto an off-screen Canvas2D and returns a
 * PNG data-URL at 2× pixel density.
 *
 * @param canvasEl  The host DOM element (used for size + querying rendered imgs)
 * @param stickers  Current placements to render
 * @param getUrl    Resolver from stickerId → image URL
 */
export async function renderCanvasToDataUrl(
    canvasEl: HTMLElement,
    stickers: StickerPlacement[],
    getUrl: (stickerId: string) => string,
): Promise<string> {
    const size       = canvasEl.clientWidth; // square canvas
    const pixelScale = 2;

    const offscreen = document.createElement("canvas");
    offscreen.width  = size * pixelScale;
    offscreen.height = size * pixelScale;
    const ctx = offscreen.getContext("2d")!;
    ctx.scale(pixelScale, pixelScale);

    // Pre-load all images in parallel
    const imageCache = await loadImages(stickers, getUrl);

    // Paint back-to-front (lowest zIndex first)
    const sorted = [...stickers].sort((a, b) => a.zIndex - b.zIndex);
    for (const placement of sorted) {
        const img = imageCache.get(getUrl(placement.stickerId));
        if (!img) continue;

        // Read actual rendered size from the DOM so the snapshot matches the preview
        const domImg = canvasEl.querySelector(
            `[data-instance-id="${placement.instanceId}"] img`,
        ) as HTMLImageElement | null;
        const drawW = domImg?.offsetWidth  ?? 64;
        const drawH = domImg?.offsetHeight ?? 64;

        const cx = placement.x + drawW / 2;
        const cy = placement.y + drawH / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((placement.rotation * Math.PI) / 180);
        ctx.scale(placement.scale, placement.scale);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
    }

    return offscreen.toDataURL("image/png");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadImages(
    stickers: StickerPlacement[],
    getUrl: (stickerId: string) => string,
): Promise<Map<string, HTMLImageElement>> {
    const cache = new Map<string, HTMLImageElement>();
    const pending = stickers
        .map(p => getUrl(p.stickerId))
        .filter((url, i, arr) => url && arr.indexOf(url) === i) // unique non-empty
        .map(url => new Promise<void>(resolve => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload  = () => { cache.set(url, img); resolve(); };
            img.onerror = () => resolve();
            img.src     = url;
        }));

    return Promise.all(pending).then(() => cache);
}

