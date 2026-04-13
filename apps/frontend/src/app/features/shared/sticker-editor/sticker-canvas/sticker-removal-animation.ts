import gsap from 'gsap';

/**
 * Animates stickers out (scale+fade on the inner <img>), then calls `done`.
 *
 * We animate the <img> inside each wrapper rather than the wrapper itself,
 * because the wrapper carries a complex CSS transform chain
 * (rotate · scale · translate(-50%,-50%)) with transform-origin:0 0.
 * Letting GSAP touch those properties would reset the position and cause a jump.
 *
 * Tracks in-progress IDs via `removingIds` to prevent double-animation.
 */
export function animateStickerRemoval(
    instanceIds: string[],
    canvasEl: HTMLElement,
    removingIds: Set<string>,
    done: () => void,
): void {
    const toAnimate = instanceIds.filter(id => !removingIds.has(id));
    if (!toAnimate.length) {
      return;
    }

    for (const id of toAnimate) {
      removingIds.add(id);
    }

    const wrappers = toAnimate
        .map(id => canvasEl.querySelector<HTMLElement>(`[data-removal-wrapper-for="${id}"]`))
        .filter((el): el is HTMLElement => !!el);

    if (!wrappers.length) {
        for (const id of toAnimate) {
          removingIds.delete(id);
        }
        done();
        return;
    }

    // Collect inner <img> elements to animate scale+opacity
    const imgs = wrappers
        .map(w => w.querySelector('img'))
        .filter((el): el is HTMLImageElement => !!el);

    // Fade the wrapper opacity so hitbox SVG etc. also disappears
    gsap.killTweensOf(wrappers);
    gsap.to(wrappers, {
        opacity: 0, duration: 0.18, ease: 'power2.in', overwrite: true,
    });

    // Scale+fade the <img> for the visual "shrink away" effect
    gsap.killTweensOf(imgs);
    gsap.to(imgs, {
        scale: 0, opacity: 0, duration: 0.18, ease: 'power2.in',
        overwrite: true, transformOrigin: '50% 50%',
        onComplete: () => {
            for (const id of toAnimate) {
              removingIds.delete(id);
            }
            done();
        },
    });
}

