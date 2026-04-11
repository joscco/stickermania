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
    /** Optional emoji/text overlaid in the top-right corner (e.g. podium medals) */
    public readonly medal = input<string | null>(null);

    public readonly sizeClasses = "w-24 h-24 rounded-2xl border-4 text-4xl";

    public readonly borderClass = computed(() => {
        switch (this.status()) {
            case "submitted":  return "border-emerald-400";
            case "drawing":    return "border-purple-400";
            case "skipped":    return "border-stone-300";
            case "offline":    return "border-stone-300";
            case "connected":  return "border-emerald-400";
            case "podium-1":   return "border-amber-400";
            case "podium-2":   return "border-stone-300";
            case "podium-3":   return "border-orange-300";
            default:           return "border-stone-200";
        }
    });

    public readonly dimmed = computed(() =>
        this.status() === "idle" || this.status() === "skipped" || this.status() === "offline"
    );

    /** Badge config: { emoji, bgClass, animate } or null */
    public readonly badge = computed<{emoji: string; bg: string; animate?: boolean} | null>(() => {
        switch (this.status()) {
            case "submitted": return {emoji: "✓",  bg: "bg-emerald-500"};
            case "drawing":   return {emoji: "🎨", bg: "bg-purple-500", animate: true};
            case "skipped":   return {emoji: "⏭",  bg: "bg-stone-400"};
            case "offline":   return {emoji: "📴", bg: "bg-stone-400"};
            default:          return null;
        }
    });
}

