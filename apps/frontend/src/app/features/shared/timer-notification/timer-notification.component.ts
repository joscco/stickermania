import {Component, input, effect, ElementRef, inject} from '@angular/core';
import gsap from 'gsap';

@Component({
  selector: 'app-timer-notification',
  standalone: true,
  template: `
    @if (text()) {
      <div #el class="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
        <div class="text-5xl font-black text-black"
             style="text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff;">
          {{ text() }}
        </div>
      </div>
    }
  `,
})
export class TimerNotificationComponent {
  readonly text = input('');
  
  private elRef = inject(ElementRef);
  
  constructor() {
    effect(() => {
      const t = this.text();
      if (!t) return;
      // Wait for DOM to render, then animate
      requestAnimationFrame(() => {
        const inner = this.elRef.nativeElement.querySelector('.text-5xl');
        if (inner) {
          gsap.killTweensOf(inner);
          gsap.fromTo(inner,
            {scale: 0.3, opacity: 0},
            {scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2.5)'},
          );
        }
      });
    });
  }
}
