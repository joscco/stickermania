import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from "@angular/core";
import type { TeamGraffitiHouse } from "@birthday/shared";
import { WorldStore } from "../../../core/world.store";
import { TagHouseComponent } from "../shared/tag-house.component";

@Component({
  selector: "app-graffiti-scene",
  standalone: true,
  imports: [CommonModule, TagHouseComponent],
  templateUrl: "./graffiti-scene.component.html",
})
export class GraffitiSceneComponent implements AfterViewInit, OnDestroy {
  private readonly worldStore = inject(WorldStore);

  @ViewChild("boardViewport") private boardViewportRef?: ElementRef<HTMLElement>;

  public readonly modeState = computed(() => this.worldStore.teamGraffitiModeState());

  public readonly houses = computed<TeamGraffitiHouse[]>(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.houses);
  });

  public readonly sceneWidth = computed(() => this.modeState()?.sceneWidth ?? 2000);
  public readonly sceneHeight = computed(() => this.modeState()?.sceneHeight ?? 1400);

  public readonly diamondHouseCount = computed(() =>
    this.houses().filter((h) => h.owner === "DIAMOND").length,
  );
  public readonly heartHouseCount = computed(() =>
    this.houses().filter((h) => h.owner === "HEART").length,
  );

  /** Continuously updated signals for timer and scores. */
  public readonly timeLeft = signal("");
  public readonly diamondScore = signal(0);
  public readonly heartScore = signal(0);

  public fitScale = 1;

  private resizeObserver?: ResizeObserver;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  public ngAfterViewInit(): void {
    this.computeFitScale();
    this.resizeObserver = new ResizeObserver(() => this.computeFitScale());
    if (this.boardViewportRef) {
      this.resizeObserver.observe(this.boardViewportRef.nativeElement);
    }

    // Continuous tick for timer and live scores (every 500ms)
    this.tickInterval = setInterval(() => this.tick(), 500);
    this.tick();
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  private tick(): void {
    const state = this.modeState();
    if (!state) return;

    // Timer
    if (state.roundEndsAt) {
      const ms = Math.max(0, state.roundEndsAt - Date.now());
      const totalSec = Math.ceil(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.timeLeft.set(`${min}:${String(sec).padStart(2, "0")}`);
    } else {
      this.timeLeft.set("");
    }

    // Live scores: base score from state + ongoing hold time for each owned house
    const now = Date.now();
    let dScore = state.teams["DIAMOND"]?.score ?? 0;
    let hScore = state.teams["HEART"]?.score ?? 0;

    if (state.roundStartedAt && state.roundEndsAt && now < state.roundEndsAt) {
      for (const house of Object.values(state.houses)) {
        if (house.owner && house.ownedSince) {
          const heldSec = Math.max(0, Math.floor((now - house.ownedSince) / 1000));
          if (house.owner === "DIAMOND") dScore += heldSec;
          else hScore += heldSec;
        }
      }
    }

    this.diamondScore.set(dScore);
    this.heartScore.set(hScore);
  }

  private computeFitScale(): void {
    if (!this.boardViewportRef) return;
    const rect = this.boardViewportRef.nativeElement.getBoundingClientRect();
    const sw = this.sceneWidth();
    const sh = this.sceneHeight();
    if (sw <= 0 || sh <= 0 || rect.width <= 0 || rect.height <= 0) return;
    this.fitScale = Math.min(rect.width / sw, rect.height / sh);
  }

  public houseImageUrl(house: TeamGraffitiHouse): string {
    const typeKey = house.houseType.toLowerCase();
    if (!house.owner) {
      return `assets/png/tag_house_${typeKey}_default.png`;
    }
    const teamKey = house.owner === "DIAMOND" ? "diamond" : "heart";
    return `assets/png/tag_house_${typeKey}_${teamKey}_${house.tagVariant}.png`;
  }
}
