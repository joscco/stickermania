/**
 * [ANIMATIONS DISABLED FOR DEBUGGING]
 * Previously animated stickers out with GSAP scale+fade. Now calls `done` immediately.
 */
export function animateStickerRemoval(
    instanceIds: string[],
    canvasEl: HTMLElement,
    removingIds: Set<string>,
    done: () => void,
): void {
    const toAnimate = instanceIds.filter(id => !removingIds.has(id));
    if (!toAnimate.length) return;
    done();
}

