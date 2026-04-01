import {
  Component,
  computed,
  input,
} from "@angular/core";
import type { DrawSearchDrawing, DrawSearchModeState } from "@birthday/shared";
import { FramedDrawingComponent } from "./shared/framed-drawing.component";
import { MuseumVisitorComponent } from "./shared/museum-visitor.component";

const VISITOR_SPRITES = [
  "assets/museum/visitor-1.svg",
  "assets/museum/visitor-2.svg",
  "assets/museum/visitor-3.svg",
];

/** Visitor defined in logical (scene) coordinates so it scales consistently. */
interface LogicalVisitor {
  id: string;
  spriteUrl: string;
  /** Logical start position. */
  x: number;
  y: number;
  /** Logical walk delta. */
  deltaX: number;
  deltaY: number;
  durationSec: number;
  delaySec: number;
  /** Logical size (will be scaled to display). */
  logicalSize: number;
  facingLeft: boolean;
}

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  imports: [FramedDrawingComponent, MuseumVisitorComponent],
  templateUrl: "./museum-scene-renderer.component.html",
})
export class MuseumSceneRendererComponent {
  public readonly modeState = input.required<DrawSearchModeState | null>();
  public readonly containerWidthPx = input.required<number>();
  public readonly containerHeightPx = input.required<number>();
  public readonly imageSizePx = input.required<number>();
  /** Logical field width from the backend (e.g. 2200) */
  public readonly logicalFieldWidth = input<number>(0);
  /** Logical field height from the backend (e.g. 2200) */
  public readonly logicalFieldHeight = input<number>(0);

  /** Scale factor: display / logical. Falls back to 1 if logical is 0 or not provided. */
  public readonly scaleX = computed(() => {
    const logical = this.logicalFieldWidth();
    return logical > 0 ? this.containerWidthPx() / logical : 1;
  });

  public readonly scaleY = computed(() => {
    const logical = this.logicalFieldHeight();
    return logical > 0 ? this.containerHeightPx() / logical : 1;
  });

  /** Uniform scale for visitor sizes (average of x/y to keep proportions). */
  public readonly uniformScale = computed(() => (this.scaleX() + this.scaleY()) / 2);

  public readonly drawingsSorted = computed<DrawSearchDrawing[]>(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });

  /**
   * Visitors defined in logical coordinates.
   * Uses the logical field dimensions so they scale identically in board and player.
   */
  public readonly visitors = computed<LogicalVisitor[]>(() => {
    const drawingCount = this.drawingsSorted().length;
    const totalSlots = Math.max(4, (this.modeState()?.museumSlots ?? []).length);
    const count = Math.min(10, Math.max(2, 1 + drawingCount));

    // Use logical dimensions if available, otherwise fall back to container px
    const lw = this.logicalFieldWidth() || this.containerWidthPx();
    const lh = this.logicalFieldHeight() || this.containerHeightPx();

    const visitors: LogicalVisitor[] = [];
    const growth = Math.min(1, drawingCount / totalSlots);

    for (let i = 0; i < count; i++) {
      const band = (i + 1) / (count + 1);
      const right = i % 2 === 0;
      const sx = right ? lw * 0.03 + (i % 3) * lw * 0.02 : lw * 0.97 - (i % 3) * lw * 0.02;
      const ex = right
        ? Math.max(sx + lw * 0.05, lw * 0.95 - (i % 3) * lw * 0.02)
        : Math.min(sx - lw * 0.05, lw * 0.05 + (i % 3) * lw * 0.02);
      const sy = Math.max(lh * 0.02, Math.min(lh * 0.98, lh * band + Math.sin(i * 91) * lh * 0.02));
      const ey = Math.max(lh * 0.02, Math.min(lh * 0.98, sy + Math.sin(i * 31 + 7) * lh * 0.04));
      const size = 40 + growth * 30 + (i % 3) * 8;

      visitors.push({
        id: `v-${i}`,
        spriteUrl: VISITOR_SPRITES[i % VISITOR_SPRITES.length],
        x: sx,
        y: sy,
        deltaX: ex - sx,
        deltaY: ey - sy,
        durationSec: 7 + i * 1.4 + (i % 3) * 0.6,
        delaySec: -i * 1.1,
        logicalSize: size,
        facingLeft: !right,
      });
    }
    return visitors;
  });

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
}
