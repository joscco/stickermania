import gsap from 'gsap';

/**
 * Animates stickers out (scale+fade), then calls `done`.
 * Tracks in-progress IDs via `removingIds` to prevent double-animation.
 */
export function animateStickerRemoval(
    instanceIds: string[],
    canvasEl: HTMLElement,
    removingIds: Set<string>,
    done: () => void,
): void {
    const toAnimate = instanceIds.filter(id => !removingIds.has(id));
    if (!toAnimate.length) return;

    for (const id of toAnimate) removingIds.add(id);

    const wrappers = toAnimate
        .map(id => canvasEl.querySelector<HTMLElement>(`[data-removal-wrapper-for="${id}"]`))
        .filter((el): el is HTMLElement => !!el);

    if (!wrappers.length) {
        for (const id of toAnimate) removingIds.delete(id);
        done();
        return;
    }

    gsap.killTweensOf(wrappers);
    gsap.to(wrappers, {
        scale: 0, opacity: 0, duration: 0.18, ease: 'power2.in',
        overwrite: true, transformOrigin: '50% 50%', force3D: true,
        onComplete: () => {
            for (const id of toAnimate) removingIds.delete(id);
            gsap.set(wrappers, {clearProps: 'transform,opacity,willChange,transformOrigin'});
            done();
        },
    });
}

