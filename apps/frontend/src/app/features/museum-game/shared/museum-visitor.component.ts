import {
  AfterViewInit,
  Component,
  ElementRef,
  input,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import gsap from "gsap";

@Component({
  selector: "app-museum-visitor",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./museum-visitor.component.html",
  styles: [`:host { display: contents; }`],
})
export class MuseumVisitorComponent implements AfterViewInit, OnDestroy {
  /** Sprite image URL (e.g. visitor-1.svg). */
  public readonly spriteUrl = input.required<string>();
  /** Display size in px. */
  public readonly sizePx = input<number>(20);
  /** Whether the visitor faces left. */
  public readonly facingLeft = input<boolean>(false);
  /** Walk delta X in display px (relative movement). */
  public readonly walkDeltaX = input<number>(0);
  /** Walk delta Y in display px (relative movement). */
  public readonly walkDeltaY = input<number>(0);
  /** Walk duration in seconds. */
  public readonly walkDurationSec = input<number>(8);
  /** Start delay in seconds (can be negative for staggering). */
  public readonly walkDelaySec = input<number>(0);

  @ViewChild("walkTarget", { static: true }) walkRef!: ElementRef<HTMLElement>;
  @ViewChild("bobTarget", { static: true }) bobRef!: ElementRef<HTMLElement>;

  private walkTimeline: gsap.core.Timeline | null = null;
  private bobTimeline: gsap.core.Timeline | null = null;

  public ngAfterViewInit(): void {
    this.startAnimations();
  }

  public ngOnDestroy(): void {
    this.walkTimeline?.kill();
    this.bobTimeline?.kill();
  }

  private startAnimations(): void {
    const walkEl = this.walkRef.nativeElement;
    const bobEl = this.bobRef.nativeElement;

    this.walkTimeline = gsap.timeline({ repeat: -1, yoyo: true, delay: this.walkDelaySec() });
    this.walkTimeline.to(walkEl, {
      x: this.walkDeltaX(),
      y: this.walkDeltaY(),
      duration: this.walkDurationSec(),
      ease: "none",
    });

    this.bobTimeline = gsap.timeline({ repeat: -1, yoyo: true, delay: this.walkDelaySec() });
    this.bobTimeline.to(bobEl, {
      y: -3,
      duration: 0.4,
      ease: "sine.inOut",
    });
  }
}
