import {Component, computed, inject, input, signal, ElementRef, AfterViewInit, OnDestroy, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, StickerCollageGameState, StickerCollage, SessionPlayer} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {IconComponent} from '../../../../shared/icon/icon.component';

const CARD_WIDTH = 256;   // w-64
const CARD_GAP   = 24;    // gap-6
const STRIP_PAD  = 32;    // px-4 on each side

@Component({
    selector: "app-board-voting-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, IconComponent],
    templateUrl: "./board-voting-scene.component.html",
    styleUrl: "./board-voting-scene.component.css",
})
export class BoardVotingSceneComponent implements AfterViewInit, OnDestroy {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly gameState = input<StickerCollageGameState | null>(null);

    @ViewChild("strip") stripEl!: ElementRef<HTMLDivElement>;

    private readonly stripWidth = signal(0);
    private resizeObserver: ResizeObserver | null = null;

    public readonly submissions = computed<StickerCollage[]>(() => {
        const ms = this.gameState();
        if (!ms) return [];
        return ms.submissions[ms.currentRoundIndex] ?? [];
    });

    /** true when the cards don't all fit side-by-side in the strip */
    public readonly needsScroll = computed(() => {
        const count = this.submissions().length;
        if (count === 0) return false;
        const totalWidth = count * CARD_WIDTH + (count - 1) * CARD_GAP + STRIP_PAD * 2;
        const available = this.stripWidth();
        // Fall back to scroll if width not measured yet and many cards
        return available > 0 ? totalWidth > available : count > 4;
    });

    /** Double the submissions for seamless infinite scroll */
    public readonly doubledSubmissions = computed(() => {
        const subs = this.submissions();
        if (subs.length === 0) return [];
        return [...subs, ...subs];
    });

    public readonly scrollDuration = computed(() => {
        const count = this.submissions().length;
        return `${Math.max(8, count * 4)}s`;
    });

    ngAfterViewInit(): void {
        const el = this.stripEl?.nativeElement;
        if (!el) return;
        this.stripWidth.set(el.clientWidth);
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.stripWidth.set(entry.contentRect.width);
            }
        });
        this.resizeObserver.observe(el);
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    public readonly doneVotingCount = computed(() => {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "VOTING" ? ps.doneVotingIds.length : 0;
    });
    public readonly roundParticipantCount = computed(() => this.gameState()?.roundParticipantIds.length ?? 0);

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.worldStore.players()[playerId];
    }

    public endVotingEarly(): void {
        const action: StickerCollageClientAction = {type: "end-voting-early"};
        this.wsService.send({type: "game-action", action});
    }
}
