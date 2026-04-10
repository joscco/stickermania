import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnInit,
  Optional,
  SkipSelf,
} from "@angular/core";
import gsap from "gsap";

export type AnimType = "banner" | "item" | "strip" | "players" | "medal" | "choice";

interface AnimPreset {
  from: gsap.TweenVars;
  to: gsap.TweenVars;
}

const PRESETS: Record<AnimType, AnimPreset> = {
  banner: {from: {opacity: 0, y: -24}, to: {opacity: 1, y: 0, duration: 0.45, ease: "power2.out"}},
  item: {from: {opacity: 0, y: 18}, to: {opacity: 1, y: 0, duration: 0.35, ease: "power2.out"}},
  strip: {from: {opacity: 0, x: 60}, to: {opacity: 1, x: 0, duration: 0.55, ease: "power2.out"}},
  players: {from: {opacity: 0, scale: 0.95}, to: {opacity: 1, scale: 1, duration: 0.4, ease: "power2.out"}},
  medal: {from: {opacity: 0, scale: 0.5}, to: {opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)"}},
  choice: {from: {opacity: 0, x: -15}, to: {opacity: 1, x: 0, duration: 0.3, ease: "power2.out"}},
};

// ─── Container für gestaggerte Gruppen ───────────────────────────────────────
// Defined first so AnimOnInitDirective can reference AnimGroupDirective.isDone.

@Directive({selector: "[animGroup]", standalone: true})
export class AnimGroupDirective implements AfterViewInit {
  @Input("animGroup") public animType: AnimType = "item";
  @Input() public animStagger = 0.08;
  @Input() public animDelay = 0;

  /** True once the group's stagger animation has completed (or had nothing to animate). */
  public isDone = false;
  private readonly children: AnimOnInitDirective[] = [];

  public register(child: AnimOnInitDirective): void {
    this.children.push(child);
  }

  public ngAfterViewInit(): void {
    const matching = this.children.filter(c => c.animType === this.animType);
    if (matching.length === 0) {
      this.isDone = true;
      return;
    }
    const elements = matching.map(c => c.el.nativeElement);
    const preset = PRESETS[this.animType] ?? PRESETS.item;
    gsap.fromTo(elements, preset.from, {
      ...preset.to,
      stagger: this.animStagger,
      delay: this.animDelay,
      onComplete: () => {
        this.isDone = true;
      },
    });
  }
}

// ─── Einzelnes Element ────────────────────────────────────────────────────────

@Directive({
  selector: "[animOnInit]",
  standalone: true,
  host: {style: "opacity: 0"},
})
export class AnimOnInitDirective implements OnInit, AfterViewInit {
  @Input("animOnInit") public animType: AnimType = "item";
  @Input() public animDelay = 0;

  public constructor(
    public readonly el: ElementRef<HTMLElement>,
    @Optional() @SkipSelf() private readonly group: AnimGroupDirective | null,
  ) {
  }

  public ngOnInit(): void {
    gsap.set(this.el.nativeElement, PRESETS[this.animType]?.from ?? PRESETS.item.from);
    this.group?.register(this);
  }

  public ngAfterViewInit(): void {
    // Delegate to the group only if the group animation hasn't finished yet
    // (i.e. we were present at mount time). If isDone is true, we were inserted
    // dynamically via @if after mount — animate ourselves independently.
    if (this.group?.animType === this.animType && !this.group.isDone) return;

    const preset = PRESETS[this.animType] ?? PRESETS.item;
    gsap.fromTo(this.el.nativeElement, preset.from, {
      ...preset.to,
      delay: (preset.to["delay"] as number ?? 0) + this.animDelay,
    });
  }
}
