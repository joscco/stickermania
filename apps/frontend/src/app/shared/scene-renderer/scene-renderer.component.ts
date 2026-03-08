import { Component, computed, input } from "@angular/core";
import type { DrawSearchDrawing, DrawSearchModeState, DrawSearchMuseumSlot } from "@birthday/shared";

interface MuseumVisitorPath {
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
  templateUrl: "./scene-renderer.component.html",
  styles: [`
    @keyframes museum-visitor-travel {
      from {
        transform: translate(0px, 0px);
      }
      to {
        transform: translate(var(--walk-dx), var(--walk-dy));
      }
    }

    @keyframes museum-visitor-wobble {
      0% {
        transform: translate(-50%, -50%) rotate(-5deg) scale(var(--v-scale));
      }
      25% {
        transform: translate(-50%, -50%) translateY(-2px) rotate(0deg) scale(var(--v-scale));
      }
      50% {
        transform: translate(-50%, -50%) rotate(5deg) scale(var(--v-scale));
      }
      75% {
        transform: translate(-50%, -50%) translateY(-2px) rotate(0deg) scale(var(--v-scale));
      }
      100% {
        transform: translate(-50%, -50%) rotate(-5deg) scale(var(--v-scale));
      }
    }

    @keyframes easel-pop-in {
      0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
      60% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }

    .museum-floor {
      background-image: url('/assets/museum/floor-tile.svg');
      background-size: 64px 64px;
      background-repeat: repeat;
    }

    .museum-wall-top {
      background: linear-gradient(180deg, #8b7355 0%, #a08060 60%, #c4a882 100%);
    }

    .museum-wall-bottom {
      background: linear-gradient(0deg, #8b7355 0%, #a08060 60%, #c4a882 100%);
    }

    .museum-wall-left {
      background: linear-gradient(90deg, #8b7355 0%, #a08060 60%, #c4a882 100%);
    }

    .museum-wall-right {
      background: linear-gradient(270deg, #8b7355 0%, #a08060 60%, #c4a882 100%);
    }
  `],
})
export class SceneRendererComponent {
  public readonly modeState = input.required<DrawSearchModeState | null>();
  public readonly containerWidthPx = input.required<number>();
  public readonly containerHeightPx = input.required<number>();
  public readonly imageSizePx = input.required<number>();

  public readonly drawingsSorted = computed<DrawSearchDrawing[]>(() => {
    const modeState = this.modeState();

    if (!modeState) {
      return [];
    }

    return Object.values(modeState.drawings).sort((leftDrawing, rightDrawing) => leftDrawing.placedAt - rightDrawing.placedAt);
  });

  public readonly museumSlots = computed<DrawSearchMuseumSlot[]>(() => this.modeState()?.museumSlots ?? []);

  public readonly freeMuseumSlots = computed<DrawSearchMuseumSlot[]>(() => {
    const usedSlotIds = new Set(
      this.drawingsSorted()
        .map((drawing) => drawing.slotId)
        .filter((slotId): slotId is string => slotId !== null),
    );

    return this.museumSlots().filter((slot) => !usedSlotIds.has(slot.id));
  });

  /** Visitor count grows with drawing count, size grows gradually too */
  public readonly visitors = computed<MuseumVisitorPath[]>(() => {
    const drawingCount = this.drawingsSorted().length;
    const slotCount = Math.max(4, this.museumSlots().length);

    // Visitors scale with drawings: 2 initially, up to 12
    const visitorCount = Math.min(12, Math.max(2, 2 + drawingCount));
    const containerWidthPx = this.containerWidthPx();
    const containerHeightPx = this.containerHeightPx();
    const visitors: MuseumVisitorPath[] = [];

    // Visitor size grows: starts small (12px), grows up to 24px
    const totalSlots = Math.max(1, slotCount);
    const growthFactor = Math.min(1, drawingCount / totalSlots);

    for (let visitorIndex = 0; visitorIndex < visitorCount; visitorIndex += 1) {
      const horizontalBand = (visitorIndex + 1) / (visitorCount + 1);
      const goingRight = visitorIndex % 2 === 0;
      const startX = goingRight ? (34 + (visitorIndex % 3) * 20) : (containerWidthPx - 34 - (visitorIndex % 3) * 20);
      const endX = goingRight
        ? Math.max(startX + 80, containerWidthPx - 50 - (visitorIndex % 3) * 24)
        : Math.min(startX - 80, 50 + (visitorIndex % 3) * 24);
      const startY = Math.max(40, Math.min(containerHeightPx - 40, containerHeightPx * horizontalBand + this.seedWave(visitorIndex * 17, 20)));
      const endY = Math.max(36, Math.min(containerHeightPx - 36, startY + this.seedWave(visitorIndex * 31 + 7, 60)));

      // Size grows from 12 to 24 based on museum fill level
      const baseSizePx = 12 + growthFactor * 12;
      const sizeVariation = (visitorIndex % 3) * 2;

      visitors.push({
        id: `visitor-${visitorIndex + 1}`,
        spriteUrl: VISITOR_SPRITES[visitorIndex % VISITOR_SPRITES.length],
        startX,
        startY,
        deltaX: endX - startX,
        deltaY: endY - startY,
        durationMs: 8000 + visitorIndex * 1500 + (visitorIndex % 3) * 800,
        delayMs: -visitorIndex * 1200,
        sizePx: baseSizePx + sizeVariation,
        facingLeft: !goingRight,
      });
    }

    return visitors;
  });

  /** Wall thickness for the museum border */
  public wallThickness(): number {
    return 12;
  }

  public frameWidth(): number {
    return this.imageSizePx() * 1.34;
  }

  public frameHeight(): number {
    return this.imageSizePx() * 1.34;
  }

  public plinthWidth(): number {
    return this.imageSizePx() * 1.62;
  }

  public plinthHeight(): number {
    return this.imageSizePx() * 1.62;
  }

  public rotationForDrawing(drawing: DrawSearchDrawing): number {
    if (!drawing.slotId) {
      return 0;
    }

    return this.museumSlots().find((slot) => slot.id === drawing.slotId)?.rotationDeg ?? 0;
  }

  private seedWave(seed: number, amplitude: number): number {
    return Math.sin(seed * 91.17) * amplitude;
  }
}
