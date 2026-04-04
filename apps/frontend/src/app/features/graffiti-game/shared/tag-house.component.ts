import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy, signal,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import type { TeamGraffitiHouse } from "@birthday/shared";
import gsap from "gsap";

/** Canonical house sprite height used across all views (board + player). */
export const TAG_HOUSE_SIZE_PX = 140;

@Component({
  selector: "app-tag-house",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./tag-house.component.html",
  styles: [`:host { display: inline-block; }`],
})
export class TagHouseComponent implements OnDestroy {
  public readonly house = input.required<TeamGraffitiHouse>();

  @ViewChild("animTarget", { static: true }) animTargetRef!: ElementRef<HTMLElement>;

  private squishTimeline: gsap.core.Timeline | null = null;
  private previousOwner: string | null | undefined = undefined;
  private shownOwner = signal<string | null | undefined>(undefined);
  private isFirstRender = true;

  public readonly imageUrl = computed(() => {
    const house = this.house();
    const houseType = house.houseType.toLowerCase();
    if (!this.shownOwner()) {
      return `assets/png/tag_house_${houseType}_default.png`;
    }
    const teamName = this.shownOwner() === "DIAMOND" ? "diamond" : "heart";
    return `assets/png/tag_house_${houseType}_${teamName}_${house.tagVariant}.png`;
  });

  constructor() {
    effect(() => {
      const currentHouse = this.house();
      if (this.previousOwner !== undefined && this.previousOwner !== currentHouse.owner) {
        this.playSquish();
      }
      this.previousOwner = currentHouse.owner;
    });

    effect(() => {
      if (this.isFirstRender) {
        // On first render, show the current owner without animation.
        this.shownOwner.set(this.house().owner);
        this.isFirstRender = false;
      }
    });
  }

  public ngOnDestroy(): void {
    this.squishTimeline?.kill();
  }

  /** Play squish animation on the inner wrapper. scaleX/scaleY are always 1-based here. */
  public playSquish(): void {
    this.squishTimeline?.kill();
    const el = this.animTargetRef.nativeElement;

    this.squishTimeline = gsap.timeline()
      .to(el, {
        scaleX: 0.5,
        scaleY: 1.1,
        duration: 0.1,
        ease: "back.out(2)",
      })
      .call(() => {
        this.shownOwner.set(this.house().owner);
      })
      .to(el, {
        scaleX: 1,
        scaleY: 1,
        duration: 0.1,
        ease: "back.out(2)",
      });
  }

  protected readonly TAG_HOUSE_SIZE_PX = TAG_HOUSE_SIZE_PX;
}
