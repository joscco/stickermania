import {
  Component, input, output,
  ElementRef, ViewChild, OnInit, effect, untracked,
} from '@angular/core';
import gsap from 'gsap';
import {StickerImgComponent} from '../../sticker-img/sticker-img.component';

export type StickerAnimState = 'entering' | 'settling' | 'idle' | 'removing';

/**
 * Renders one sticker and owns its enter/settle/remove GSAP animations.
 *
 * The host div is positioned by the canvas (@for loop); the inner `.anim-target`
 * is what GSAP touches so it never conflicts with inline transforms on the host.
 *
 * State machine:
 *   entering  → fades in from opacity:0 (palette drag: pointer still down)
 *   settling  → spring bounce scale 0.72→1 (landed on canvas / duplicated)
 *   idle      → no animation running
 *   removing  → scale+fade out, emits `removed` when done
 */
@Component({
  selector: 'app-sticker-item',
  standalone: true,
  imports: [StickerImgComponent],
  templateUrl: './sticker-item.component.html',
  host: {style: 'display: contents;'},
})
export class StickerItemComponent implements OnInit {
  readonly instanceId = input.required<string>();
  readonly imageUrl = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly hitboxPoints = input<string>('');
  readonly lassoSelected = input<boolean>(false);
  /** Current animation state — driven by the parent canvas. */
  readonly animState = input<StickerAnimState>('idle');
  /** Emitted when the remove animation finishes (parent should then delete the placement). */
  readonly removed = output<void>();
  /** Emitted when entering or settling animation finishes (parent can reset state to idle). */
  readonly animDone = output<void>();

  @ViewChild('animTarget', {static: true}) private animTarget!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    // Start invisible for entering/settling states so first paint is already opacity:0.
    const initial = this.animState();
    if (initial === 'entering' || initial === 'settling') {
      gsap.set(this.animTarget.nativeElement, {opacity: 0});
    }
  }

  constructor() {
    effect(() => {
      const state = this.animState();
      // Read instanceId reactively but don't re-run when only it changes.
      untracked(() => this.runAnimation(state));
    });
  }

  private runAnimation(state: StickerAnimState): void {
    const el = this.animTarget?.nativeElement;
    if (!el) return;
    gsap.killTweensOf(el);

    switch (state) {
      case 'entering':
        // Pointer is still down — only fade in, no scale fight with drag.
        gsap.set(el, {scale: 0.5, opacity: 0});
        gsap.to(el, {
          scale: 1,
          opacity: 1,
          duration: 0.2,
          ease: 'back.out(3)',
          clearProps: 'opacity',
          onComplete: () => this.animDone.emit()
        });
        break;

      case 'settling':
        // Spring bounce after landing on canvas or duplicating.
        gsap.set(el, {opacity: 1});
        gsap.fromTo(el,
          {scaleX: 1.03, scaleY: 0.98},
          {
            scale: 1,
            duration: 0.35,
            ease: 'back.out(3)',
            transformOrigin: '50% 50%',
            clearProps: 'transform',
            onComplete: () => this.animDone.emit(),
          },
        );
        break;

      case 'removing':
        el.style.pointerEvents = 'none';
        gsap.to(el, {
          scale: 0.5,
          opacity: 0,
          duration: 0.2,
          ease: 'back.in(3)',
          transformOrigin: '50% 50%',
          onComplete: () => this.removed.emit(),
        });
        break;

      case 'idle':
        gsap.set(el, {clearProps: 'opacity,transform,pointerEvents'});
        break;
    }
  }

}


