import {Component, computed, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";
import {SvgComponent} from '../../../shared/svg/svg.component';

/**
 * Visual status of a player in the current round phase.
 *
 * - `idle`      — in round, nothing done yet (building phase, hand not requested)
 * - `drawing`   — has received a hand, currently building
 * - `submitted` — has submitted their collage
 * - `skipped`   — has opted to skip the round
 * - `offline`   — was a round participant but is currently disconnected
 * - `connected` — generic "online" state (lobby)
 * - `podium-1/2/3` — results podium position
 */
export type PlayerAvatarStatus =
  | "idle"
  | "drawing"
  | "submitted"
  | "skipped"
  | "offline"
  | "connected"
  | "podium";

@Component({
  selector: "app-board-player-avatar",
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: "./board-player-avatar.component.html",
})
export class BoardPlayerAvatarComponent {
  public readonly player = input.required<SessionPlayer>();
  public readonly status = input<PlayerAvatarStatus>("idle");

  public readonly sizeClasses = "w-24 h-24 rounded-2xl border-4 text-4xl";

  public readonly borderClass = computed(() => {
    switch (this.status()) {
      case "submitted":
        return "border-neutral-700";
      case "drawing":
        return "border-neutral-500";
      case "skipped":
        return "border-neutral-300";
      case "offline":
        return "border-neutral-300";
      case "connected":
        return "border-neutral-700";
      case "podium":
        return "border-black";
      default:
        return "border-neutral-200";
    }
  });

  public readonly dimmed = computed(() =>
    this.status() === "idle" || this.status() === "skipped" || this.status() === "offline"
  );

  /** Badge config: { spriteId, bgClass, animate } or null */
  public readonly badge = computed<{ spriteId: string; bg: string; animate?: boolean } | null>(() => {
    switch (this.status()) {
      case "submitted":
        return {spriteId: "icon-checkmark-sm", bg: "bg-neutral-800"};
      case "drawing":
        return {spriteId: "icon-stickers-lg", bg: "bg-neutral-600", animate: true};
      case "skipped":
        return {spriteId: "icon-pause-lg", bg: "bg-neutral-400"};
      case "offline":
        return {spriteId: "disconnected", bg: "bg-neutral-400"};
      default:
        return null;
    }
  });
}

