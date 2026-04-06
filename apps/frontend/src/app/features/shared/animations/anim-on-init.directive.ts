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
  banner: {
    from: { opacity: 0, y: -24 },
    to:   { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
  },
  item: {
    from: { opacity: 0, y: 18 },
    to:   { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
  },
  strip: {
    from: { opacity: 0, x: 60 },
    to:   { opacity: 1, x: 0, duration: 0.55, ease: "power2.out" },
  },
  players: {
    from: { opacity: 0, scale: 0.95 },
    to:   { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" },
  },
  medal: {
    from: { opacity: 0, scale: 0.5 },
    to:   { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" },
  },
  choice: {
    from: { opacity: 0, x: -15 },
    to:   { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
  },
};

// ─── Einzelnes Element ────────────────────────────────────────────────────────

@Directive({
  selector: "[animOnInit]",
  standalone: true,
  // opacity:0 verhindert FOUC beim ersten Paint, bevor JS läuft.
  host: { style: "opacity: 0" },
})
export class AnimOnInitDirective implements OnInit, AfterViewInit {
  @Input("animOnInit") public animType: AnimType = "item";
  @Input() public animDelay = 0;

  // Wird von AnimGroupDirective gesetzt um diese Direktive zu claimen.
  // (reserviert für künftige Erweiterungen)

  public constructor(
    public readonly el: ElementRef<HTMLElement>,
    // Optional: der nächste AnimGroupDirective-Ancestor im Injector-Baum.
    // SkipSelf damit wir nicht uns selbst finden (falls animGroup+animOnInit
    // auf dem gleichen Element stünden).
    @Optional() @SkipSelf() private readonly group: AnimGroupDirective | null,
  ) {}

  public ngOnInit(): void {
    // from-State sofort setzen (inkl. transform) bevor der erste Frame gemalt wird.
    gsap.set(this.el.nativeElement, PRESETS[this.animType]?.from ?? PRESETS.item.from);
    // Beim Parent-Group registrieren (animType ist jetzt verfügbar).
    this.group?.register(this);
  }

  public ngAfterViewInit(): void {
    // Wenn eine Gruppe via DI gefunden wurde und denselben Typ hat,
    // überlässt diese Direktive die Animation komplett der Gruppe.
    if (this.group?.animType === this.animType) return;

    const preset = PRESETS[this.animType] ?? PRESETS.item;
    gsap.fromTo(this.el.nativeElement, preset.from, {
      ...preset.to,
      delay: (preset.to["delay"] as number ?? 0) + this.animDelay,
    });
  }
}

// ─── Container für gestaggerte Gruppen ───────────────────────────────────────

/**
 * Container-Direktive, die alle Kinder-`animOnInit` desselben Typs
 * als gestaggerte Gruppe animiert.
 *
 *   <ul animGroup="item" [animStagger]="0.07" [animDelay]="0.3">
 *     <li animOnInit="item">...</li>
 *   </ul>
 */
@Directive({
  selector: "[animGroup]",
  standalone: true,
})
export class AnimGroupDirective implements AfterViewInit {
  @Input("animGroup") public animType: AnimType = "item";
  @Input() public animStagger = 0.08;
  @Input() public animDelay = 0;

  private readonly children: AnimOnInitDirective[] = [];

  public constructor() {}

  /** Wird von AnimOnInitDirective im Constructor aufgerufen – vor ngOnInit. */
  public register(child: AnimOnInitDirective): void {
    this.children.push(child);
  }

  public ngAfterViewInit(): void {
    const matching = this.children.filter(c => c.animType === this.animType);
    if (matching.length === 0) return;

    const elements = matching.map(c => c.el.nativeElement);
    const preset = PRESETS[this.animType] ?? PRESETS.item;
    gsap.fromTo(elements, preset.from, {
      ...preset.to,
      stagger: this.animStagger,
      delay: this.animDelay,
    });
  }
}

