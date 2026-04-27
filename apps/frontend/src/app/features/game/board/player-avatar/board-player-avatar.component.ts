import {Component, computed, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";

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
    | "podium-1"
    | "podium-2"
    | "podium-3";

@Component({
    selector: "app-board-player-avatar",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-player-avatar.component.html",
})
export class BoardPlayerAvatarComponent {
    public readonly player = input.required<SessionPlayer>();
    public readonly status = input<PlayerAvatarStatus>("idle");

    public readonly sizeClasses = "w-24 h-24 rounded-2xl border-4 text-4xl";

    public readonly borderClass = computed(() => {
        switch (this.status()) {
            case "submitted":  return "border-stone-700";
            case "drawing":    return "border-stone-500";
            case "skipped":    return "border-stone-300";
            case "offline":    return "border-stone-300";
            case "connected":  return "border-stone-700";
            case "podium-1":   return "border-black";
            case "podium-2":   return "border-stone-500";
            case "podium-3":   return "border-stone-400";
            default:           return "border-stone-200";
        }
    });

    public readonly dimmed = computed(() =>
        this.status() === "idle" || this.status() === "skipped" || this.status() === "offline"
    );

    /** Badge config: { spriteId, bgClass, animate } or null */
    public readonly badge = computed<{spriteId: string; bg: string; animate?: boolean} | null>(() => {
        switch (this.status()) {
            case "submitted": return {spriteId: "icon-checkmark", bg: "bg-stone-800"};
            case "drawing":   return {spriteId: "icon-paintbrush", bg: "bg-stone-600", animate: true};
            case "skipped":   return {spriteId: "icon-pause",      bg: "bg-stone-400"};
            case "offline":   return {spriteId: "icon-hourglass",  bg: "bg-stone-400"};
            default:          return null;
        }
    });

    /** Medal sprite ID for podium positions */
    public readonly medalSpriteId = computed<string | null>(() => {
        switch (this.status()) {
            case "podium-1": return "icon-medal-gold";
            case "podium-2": return "icon-medal-silver";
            case "podium-3": return "icon-medal-bronze";
            default:         return null;
        }
    });
}

