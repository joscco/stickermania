import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchDrawing } from "@birthday/shared";
import gsap from "gsap";

@Component({
  selector: "app-framed-drawing",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./framed-drawing.component.html",
  styles: [`:host { display: inline-block; }`],
})
export class FramedDrawingComponent implements OnDestroy {
  public readonly drawing = input.required<DrawSearchDrawing>();
  /** Total height of the frame+easel in px. */
  public readonly sizePx = input<number>(120);
  /** Whether to play a pop-in animation when the component first appears. */
  public readonly animateIn = input<boolean>(false);

  @ViewChild("animTarget", { static: true }) animTargetRef!: ElementRef<HTMLElement>;

  private timeline: gsap.core.Timeline | null = null;
  private hasAnimatedIn = false;

  /** Deterministic frame variant (0–4) based on drawing id. */
  public readonly frameIdx = computed(() => {
    let hash = 0;
    for (const ch of this.drawing().id) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % 5;
  });

  constructor() {
    effect(() => {
      // Re-read drawing to track changes
      this.drawing();
      if (this.animateIn() && !this.hasAnimatedIn) {
        this.hasAnimatedIn = true;
        this.playPopIn();
      }
    });
  }

  public ngOnDestroy(): void {
    this.timeline?.kill();
  }

  /** Pop-in animation: scales from 0 to 1 with a back-ease overshoot. */
  public playPopIn(): void {
    this.timeline?.kill();
    const el = this.animTargetRef.nativeElement;

    this.timeline = gsap.timeline()
      .fromTo(el,
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.45,
          ease: "back.out(1.4)",
          delay: 0.05,
        },
      );
  }
}

