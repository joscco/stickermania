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
    <div #animTarget class="relative" [style.height.px]="sizePx" style="width: fit-content; margin: 0 auto;">
      <!-- Frame + easel PNG -->
      <img
        [src]="'assets/png/art_frame_' + frameIdx + '.png'"
        [style.height.px]="sizePx"
        style="width: auto; display: block;"
        alt="" draggable="false"
      />
      <!-- Actual painting, centered inside the frame -->
      <img
        class="absolute left-1/2 -translate-x-1/2 object-cover rounded-sm"
        [style.width.px]="sizePx * 0.48"
        [style.height.px]="sizePx * 0.48"
        [style.top.px]="sizePx * 0.1"
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

