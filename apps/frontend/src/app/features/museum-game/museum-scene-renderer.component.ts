import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  viewChildren,
} from "@angular/core";
import type { DrawSearchDrawing, DrawSearchModeState, DrawSearchMuseumSlot } from "@birthday/shared";
import gsap from "gsap";

interface MuseumVisitor {
  id: string;
  spriteUrl: string;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  durationMs: number;
  delayMs: number;
  sizePx: number;
  facingLeft: boolean;
}

const VISITOR_SPRITES = [
  "assets/museum/visitor-1.svg",
  "assets/museum/visitor-2.svg",
  "assets/museum/visitor-3.svg",
];

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  templateUrl: "./museum-scene-renderer.component.html",
  styles: [`

    @keyframes pop-in {
      0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
      60%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
  `],
})
export class MuseumSceneRendererComponent implements OnDestroy {
  public readonly modeState = input.required<DrawSearchModeState | null>();
  public readonly containerWidthPx = input.required<number>();
  public readonly containerHeightPx = input.required<number>();
  public readonly imageSizePx = input.required<number>();
  /** Logical field width from the backend (e.g. 2200) */
  public readonly logicalFieldWidth = input<number>(0);
  /** Logical field height from the backend (e.g. 2200) */
  public readonly logicalFieldHeight = input<number>(0);

  /** Query all visitor wrapper elements */
  private readonly visitorEls = viewChildren<ElementRef<HTMLElement>>('visitorEl');
  /** Query all visitor inner (bob) elements */
  private readonly visitorBobEls = viewChildren<ElementRef<HTMLElement>>('visitorBobEl');

  private visitorTimelines: gsap.core.Timeline[] = [];

  constructor() {
    // Re-create GSAP animations whenever visitors or their DOM elements change
    effect(() => {
      const visitors = this.visitors();
      const els = this.visitorEls();
      const bobEls = this.visitorBobEls();
      // Kill existing timelines
      this.killTimelines();

      if (els.length === 0 || els.length !== visitors.length) return;

      visitors.forEach((v, i) => {
        const walkEl = els[i].nativeElement;
        const bobEl = bobEls[i].nativeElement;

        // Walk timeline: move from start position to start+delta and back, infinitely
        const walkTl = gsap.timeline({ repeat: -1, yoyo: true, delay: v.delayMs / 1000 });
        walkTl.to(walkEl, {
          x: v.deltaX,
          y: v.deltaY,
          duration: v.durationMs / 1000,
          ease: 'none',
        });

        // Bob timeline: gentle up-down bobbing
        const bobTl = gsap.timeline({ repeat: -1, yoyo: true, delay: v.delayMs / 1000 });
        bobTl.to(bobEl, {
          y: -3,
          duration: 0.4,
          ease: 'sine.inOut',
        });

        this.visitorTimelines.push(walkTl, bobTl);
      });
    });
  }

  ngOnDestroy(): void {
    this.killTimelines();
  }

  private killTimelines(): void {
    this.visitorTimelines.forEach((tl) => tl.kill());
    this.visitorTimelines = [];
  }

  /** Scale factor: display / logical. Falls back to 1 if logical is 0 or not provided. */
  public readonly scaleX = computed(() => {
    const logical = this.logicalFieldWidth();
    return logical > 0 ? this.containerWidthPx() / logical : 1;
  });

  public readonly scaleY = computed(() => {
    const logical = this.logicalFieldHeight();
    return logical > 0 ? this.containerHeightPx() / logical : 1;
  });

  public readonly drawingsSorted = computed<DrawSearchDrawing[]>(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });

  public readonly museumSlots = computed<DrawSearchMuseumSlot[]>(() => this.modeState()?.museumSlots ?? []);

  public readonly freeSlots = computed<DrawSearchMuseumSlot[]>(() => {
    const used = new Set(
      this.drawingsSorted()
        .map((d) => d.slotId)
        .filter((id): id is string => id !== null),
    );
    return this.museumSlots().filter((s) => !used.has(s.id));
  });

  public readonly visitors = computed<MuseumVisitor[]>(() => {
    const drawingCount = this.drawingsSorted().length;
    const totalSlots = Math.max(4, this.museumSlots().length);
    const count = Math.min(10, Math.max(2, 1 + drawingCount));
    const w = this.containerWidthPx();
    const h = this.containerHeightPx();
    const visitors: MuseumVisitor[] = [];
    const growth = Math.min(1, drawingCount / totalSlots);

    for (let i = 0; i < count; i++) {
      const band = (i + 1) / (count + 1);
      const right = i % 2 === 0;
      const sx = right ? 30 + (i % 3) * 18 : w - 30 - (i % 3) * 18;
      const ex = right ? Math.max(sx + 60, w - 40 - (i % 3) * 20) : Math.min(sx - 60, 40 + (i % 3) * 20);
      const sy = Math.max(30, Math.min(h - 30, h * band + Math.sin(i * 91) * 18));
      const ey = Math.max(30, Math.min(h - 30, sy + Math.sin(i * 31 + 7) * 50));
      const size = 14 + growth * 10 + (i % 3) * 2;

      visitors.push({
        id: `v-${i}`,
        spriteUrl: VISITOR_SPRITES[i % VISITOR_SPRITES.length],
        startX: sx, startY: sy,
        deltaX: ex - sx, deltaY: ey - sy,
        durationMs: 7000 + i * 1400 + (i % 3) * 600,
        delayMs: -i * 1100,
        sizePx: size,
        facingLeft: !right,
      });
    }
    return visitors;
  });

  public framePx(): number {
    return this.imageSizePx() * 1.22;
  }

  public slotPx(): number {
    return this.imageSizePx() * 1.5;
  }

  /** Scale a logical X coordinate to display space */
  public sx(logicalX: number): number {
    return logicalX * this.scaleX();
  }

  /** Scale a logical Y coordinate to display space */
  public sy(logicalY: number): number {
    return logicalY * this.scaleY();
  }

  public rotation(drawing: DrawSearchDrawing): number {
    if (!drawing.slotId) return 0;
    return this.museumSlots().find((s) => s.id === drawing.slotId)?.rotationDeg ?? 0;
  }
}
