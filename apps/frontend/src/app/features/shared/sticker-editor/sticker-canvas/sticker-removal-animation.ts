import gsap from 'gsap';

/** Resolves the inner `.sticker-anim-wrap` for a given instance id. */
function getWrap(instanceId: string, canvasEl: HTMLElement): HTMLElement | null {
    return canvasEl.querySelector<HTMLElement>(
        `[data-removal-wrapper-for="${instanceId}"] .sticker-anim-wrap`,
    );
}

/**
 * Animates sticker removal on the inner `.sticker-anim-wrap` so transform-origin is
 * always the visual center of the sticker (50% 50%).
 * opacity + scale are both on the inner wrap → no conflict with Angular class bindings
 * on the outer wrapper.
 */
export function animateStickerRemoval(
    instanceIds: string[],
    canvasEl: HTMLElement,
    done: () => void,
): void {
    if (!instanceIds.length) { done(); return; }

    const wraps = instanceIds
        .map(id => getWrap(id, canvasEl))
        .filter((el): el is HTMLElement => !!el);

    if (!wraps.length) { done(); return; }

    wraps.forEach(el => {
        gsap.killTweensOf(el);
        // Disable pointer events on outer wrapper during animation
        const outer = el.parentElement;
        if (outer) outer.style.pointerEvents = 'none';
    });

    gsap.to(wraps, {
        scale: 0.1,
        opacity: 0,
        duration: 0.22,
        ease: 'back.in(1.5)',
        transformOrigin: '50% 50%',
        onComplete: done,
    });
}

/**
 * Small spring-settle bounce — shown when a sticker lands on the canvas
 * (palette drop, duplicate, any programmatic placement).
 */
export function animateStickerSettle(instanceId: string, canvasEl: HTMLElement): void {
    const wrap = getWrap(instanceId, canvasEl);
    if (!wrap) return;

    gsap.killTweensOf(wrap);
    gsap.fromTo(wrap,
        {scale: 0.72},
        {scale: 1, duration: 0.35, ease: 'back.out(3)', transformOrigin: '50% 50%', clearProps: 'transform'},
    );
}

/**
 * Fade-in shown when a sticker first appears during a palette drag
 * (pointer still down — no scale animation to avoid fighting the drag movement).
 */
export function animateStickerFadeIn(instanceId: string, canvasEl: HTMLElement): void {
    const wrap = getWrap(instanceId, canvasEl);
    if (!wrap) return;

    gsap.killTweensOf(wrap);
    // Element is already at opacity:0 via Angular binding — just animate to 1 and clean up.
    gsap.to(wrap, {opacity: 1, duration: 0.18, ease: 'power2.out', clearProps: 'opacity'});
}
