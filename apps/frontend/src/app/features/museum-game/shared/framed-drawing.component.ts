import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchDrawing } from "@birthday/shared";
import gsap from "gsap";

@Component({
  selector: "app-framed-drawing",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #animTarget class="relative" [style.width.px]="sizePx" [style.height.px]="sizePx" style="margin: 0 auto;">
      <!-- Frame 500x500 native, scaled to sizePx -->
      <img
        [src]="'assets/png/art_frame_' + frameIdx + '.png'"
        class="absolute inset-0 w-full h-full"
        alt="" draggable="false"
      />
      <!-- Painting 400x400 native = 2/3 of 600, centered (16% inset) -->
      <img
        class="absolute object-cover"
        style="top: 16%; left: 16%; width: 66%; height: 66%;"
        [src]="drawing.imageUrl"
        [alt]="drawing.prompt"
        draggable="false"
      />
    </div>
  `,
  styles: [`:host { display: inline-block; }`],
})
export class FramedDrawingComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) drawing!: DrawSearchDrawing;
  /** Total height of the frame+easel in px. */
  @Input() sizePx = 120;
  /** Whether to play a pop-in animation when the component first appears. */
  @Input() animateIn = false;

  @ViewChild("animTarget", { static: true }) animTargetRef!: ElementRef<HTMLElement>;

  private timeline: gsap.core.Timeline | null = null;
  private hasAnimatedIn = false;

  /** Deterministic frame variant (0–4) based on drawing id. */
  public get frameIdx(): number {
    let hash = 0;
    for (const ch of this.drawing.id) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % 5;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["drawing"] && this.animateIn && !this.hasAnimatedIn) {
      this.hasAnimatedIn = true;
      this.playPopIn();
    }
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

