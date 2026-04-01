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
import type { TeamGraffitiHouse } from "@birthday/shared";
import gsap from "gsap";

@Component({
  selector: "app-tag-house",
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Outer wrapper: only handles the horizontal flip (never touched by GSAP) -->
    <div [style.transform]="house.flipped ? 'scaleX(-1)' : ''">
      <!-- Inner wrapper: GSAP animates scaleX/scaleY here (always 1-based) -->
      <div #animTarget class="inline-block">
        <img [src]="imageUrl"
             class="w-auto drop-shadow-md"
             [style.height.px]="sizePx"
             alt="" draggable="false" />
      </div>
    </div>
  `,
  styles: [`:host { display: inline-block; }`],
})
export class TagHouseComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) house!: TeamGraffitiHouse;
  @Input() sizePx = 160;

  @ViewChild("animTarget", { static: true }) animTargetRef!: ElementRef<HTMLElement>;

  private timeline: gsap.core.Timeline | null = null;
  private prevOwner: string | null | undefined = undefined;

  public get imageUrl(): string {
    const t = this.house.houseType.toLowerCase();
    if (!this.house.owner) {
      return `assets/png/tag_house_${t}_default.png`;
    }
    const team = this.house.owner === "DIAMOND" ? "diamond" : "heart";
    return `assets/png/tag_house_${t}_${team}_${this.house.tagVariant}.png`;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["house"]) {
      const curr = this.house;
      if (this.prevOwner !== undefined && this.prevOwner !== curr.owner) {
        this.playSquish();
      }
      this.prevOwner = curr.owner;
    }
  }

  public ngOnDestroy(): void {
    this.timeline?.kill();
  }

  /** Play squish animation on the inner wrapper. scaleX/scaleY are always 1-based here. */
  public playSquish(): void {
    this.timeline?.kill();
    const el = this.animTargetRef.nativeElement;

    this.timeline = gsap.timeline()
      .to(el, {
        scaleX: 0.5,
        scaleY: 1.12,
        duration: 0.12,
        ease: "power2.in",
      })
      .to(el, {
        scaleX: 1.15,
        scaleY: 0.9,
        duration: 0.15,
        ease: "back.out(2)",
      })
      .to(el, {
        scaleX: 1,
        scaleY: 1,
        duration: 0.25,
        ease: "elastic.out(1, 0.4)",
      });
  }
}
