import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import gsap from "gsap";

@Component({
  selector: "app-museum-visitor",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #walkTarget class="absolute pointer-events-none" style="will-change: transform;">
      <div #bobTarget [style.width.px]="sizePx" [style.height.px]="sizePx">
        <img
          [src]="spriteUrl"
          class="w-full h-full"
          [style.transform]="facingLeft ? 'scaleX(-1)' : ''"
          alt="" draggable="false"
        />
      </div>
    </div>
  `,
  styles: [`:host { display: contents; }`],
})
export class MuseumVisitorComponent implements AfterViewInit, OnDestroy {
  /** Sprite image URL (e.g. visitor-1.svg). */
  @Input({ required: true }) spriteUrl!: string;
  /** Display size in px. */
  @Input() sizePx = 20;
  /** Whether the visitor faces left. */
  @Input() facingLeft = false;

  /** Walk delta X in display px (relative movement). */
  @Input() deltaX = 0;
  /** Walk delta Y in display px (relative movement). */
  @Input() deltaY = 0;
  /** Walk duration in seconds. */
  @Input() durationSec = 8;
  /** Start delay in seconds (can be negative for staggering). */
  @Input() delaySec = 0;

  @ViewChild("walkTarget", { static: true }) walkRef!: ElementRef<HTMLElement>;
  @ViewChild("bobTarget", { static: true }) bobRef!: ElementRef<HTMLElement>;

  private walkTl: gsap.core.Timeline | null = null;
  private bobTl: gsap.core.Timeline | null = null;

  public ngAfterViewInit(): void {
    this.startAnimations();
  }

  public ngOnDestroy(): void {
    this.walkTl?.kill();
    this.bobTl?.kill();
  }

  private startAnimations(): void {
    const walkEl = this.walkRef.nativeElement;
    const bobEl = this.bobRef.nativeElement;

    this.walkTl = gsap.timeline({ repeat: -1, yoyo: true, delay: this.delaySec });
    this.walkTl.to(walkEl, {
      x: this.deltaX,
      y: this.deltaY,
      duration: this.durationSec,
      ease: "none",
    });

    this.bobTl = gsap.timeline({ repeat: -1, yoyo: true, delay: this.delaySec });
    this.bobTl.to(bobEl, {
      y: -3,
      duration: 0.4,
      ease: "sine.inOut",
    });
  }
}

