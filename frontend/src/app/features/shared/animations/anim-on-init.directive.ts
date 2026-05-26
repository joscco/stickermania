import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  Optional,
  SimpleChanges,
  SkipSelf,
} from "@angular/core";
import gsap from "gsap";

export type AnimType = "opacity" | "banner" | "strip" | "players" | "medal" | "choice" | "overlay";

interface AnimPreset {
  from: gsap.TweenVars;
  to: gsap.TweenVars;
}

const PRESETS: Record<AnimType, AnimPreset> = {
  opacity: {from: {opacity: 0}, to: {opacity: 1, duration: 0.3, ease: "power2.out"}},
  banner: {from: {opacity: 0, y: -24}, to: {opacity: 1, y: 0, duration: 0.45, ease: "power2.out"}},
  strip: {from: {opacity: 0, x: 60}, to: {opacity: 1, x: 0, duration: 0.55, ease: "power2.out"}},
  players: {from: {opacity: 0, scale: 0.95}, to: {opacity: 1, scale: 1, duration: 0.4, ease: "power2.out"}},
  medal: {from: {opacity: 0, scale: 0.5}, to: {opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)"}},
  choice: {from: {opacity: 0, x: -15}, to: {opacity: 1, x: 0, duration: 0.3, ease: "power2.out"}},
  overlay: {from: {opacity: 0}, to: {opacity: 1, duration: 0.2, ease: "power1.out"}},
};

// ─── Container für gestaggerte Gruppen ───────────────────────────────────────
// Defined first so AnimOnInitDirective can reference AnimGroupDirective.isDone.

@Directive({selector: "[animGroup]", standalone: true})
export class AnimGroupDirective implements AfterViewInit {
  @Input("animGroup") public animType: AnimType = "opacity";
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
    const preset = PRESETS[this.animType] ?? PRESETS.opacity;
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
  @Input("animOnInit") public animType: AnimType = "opacity";
  @Input() public animDelay = 0;

  public constructor(
    public readonly el: ElementRef<HTMLElement>,
    @Optional() @SkipSelf() private readonly group: AnimGroupDirective | null,
  ) {
  }

  public ngOnInit(): void {
    gsap.set(this.el.nativeElement, PRESETS[this.animType]?.from ?? PRESETS.opacity.from);
    this.group?.register(this);
  }

  public ngAfterViewInit(): void {
    // Delegate to the group only if the group animation hasn't finished yet
    // (i.e. we were present at mount time). If isDone is true, we were inserted
    // dynamically via @if after mount — animate ourselves independently.
    if (this.group?.animType === this.animType && !this.group.isDone) return;

    const preset = PRESETS[this.animType] ?? PRESETS.opacity;
    gsap.fromTo(this.el.nativeElement, preset.from, {
      ...preset.to,
      delay: (preset.to["delay"] as number ?? 0) + this.animDelay,
    });
  }
}

// ─── Präsenz-Animation (Ein-/Ausblenden) ─────────────────────────────────────

@Directive({
  selector: "[animPresence]",
  standalone: true,
})
export class AnimPresenceDirective implements OnInit, OnChanges {
  @Input("animPresence") public visible = false;
  @Input() public animPresenceType: AnimType = "opacity";
  @Input() public animPresenceDelay = 0;

  public constructor(private readonly el: ElementRef<HTMLElement>) {}

  public ngOnInit(): void {
    if (this.visible) {
      this.showImmediately();
      return;
    }
    this.hideImmediately();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (!changes["visible"] || changes["visible"].firstChange) return;
    if (this.visible) {
      this.animateIn();
      return;
    }
    this.animateOut();
  }

  private animateIn(): void {
    const node = this.el.nativeElement;
    const preset = PRESETS[this.animPresenceType] ?? PRESETS.opacity;
    gsap.killTweensOf(node);
    node.style.display = "";
    node.style.visibility = "visible";
    node.style.pointerEvents = "";

    gsap.fromTo(node, preset.from, {
      ...preset.to,
      delay: (preset.to["delay"] as number ?? 0) + this.animPresenceDelay,
      clearProps: "transform,opacity",
    });
  }

  private animateOut(): void {
    const node = this.el.nativeElement;
    const preset = PRESETS[this.animPresenceType] ?? PRESETS.opacity;
    const duration = Math.max(0.16, Number(preset.to["duration"] ?? 0.2) * 0.85);
    gsap.killTweensOf(node);

    gsap.to(node, {
      opacity: 0,
      x: (preset.from["x"] as number | undefined) ?? 0,
      y: (preset.from["y"] as number | undefined) ?? 0,
      scale: (preset.from["scale"] as number | undefined) ?? 1,
      duration,
      ease: "power1.in",
      onComplete: () => this.hideImmediately(),
    });
  }

  private showImmediately(): void {
    const node = this.el.nativeElement;
    gsap.killTweensOf(node);
    node.style.display = "";
    node.style.visibility = "visible";
    node.style.pointerEvents = "";
  }

  private hideImmediately(): void {
    const node = this.el.nativeElement;
    gsap.killTweensOf(node);
    node.style.display = "none";
    node.style.visibility = "hidden";
    node.style.pointerEvents = "none";
    gsap.set(node, {clearProps: "transform,opacity"});
  }
}
