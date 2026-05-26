import {Component, input, effect, ElementRef, inject, signal} from '@angular/core';
import gsap from 'gsap';

@Component({
  selector: 'app-timer-notification',
  standalone: true,
  host: {class: 'absolute inset-0 z-40 flex items-center justify-center pointer-events-none'},
  template: `
    <div #el class="text-5xl font-black text-black invisible"
         style="text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff;">
      {{ displayText() }}
    </div>
  `,
})
export class TimerNotificationComponent {
  readonly text = input('');

  private elRef = inject(ElementRef);
  displayText = signal('');

  constructor() {
    effect(() => {
      const newText = this.text();
      if (newText === this.displayText()) return;

      const el = this.elRef.nativeElement.querySelector('.text-5xl') as HTMLElement;
      if (!el) return;

      const current = this.displayText();

      if (!current) {
        this.displayText.set(newText);
        requestAnimationFrame(() => this.animateIn(el));
      } else {
        gsap.killTweensOf(el);
        gsap.to(el, {
          scale: 0.3, opacity: 0, duration: 0.15, ease: 'power1.in',
          onComplete: () => {
            if (!newText) {
              this.displayText.set('');
              el.style.visibility = 'hidden';
              gsap.set(el, {clearProps: 'transform,opacity'});
            } else {
              this.displayText.set(newText);
              gsap.set(el, {clearProps: 'transform,opacity'});
              el.style.visibility = 'hidden';
              requestAnimationFrame(() => this.animateIn(el));
            }
          },
        });
      }
    });
  }

  private animateIn(el: HTMLElement): void {
    gsap.killTweensOf(el);
    gsap.fromTo(el,
      {scale: 0.3, opacity: 0},
      {scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2.5)',
        onStart: () => { el.style.visibility = 'visible'; }},
    );
  }
}
