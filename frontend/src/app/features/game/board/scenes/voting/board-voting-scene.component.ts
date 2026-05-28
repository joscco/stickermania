import {Component, computed, input, output, signal, ElementRef, AfterViewInit, OnDestroy, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {PartyGameState, RoundSubmission} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';
import {RoundInfoComponent} from '../../../../shared/round-info/round-info.component';

const CARD_WIDTH = 256;
const CARD_GAP   = 24;
const STRIP_PAD  = 32;

@Component({
    selector: "app-board-voting-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, SvgComponent, RoundInfoComponent],
    templateUrl: "./board-voting-scene.component.html",
    styleUrl: "./board-voting-scene.component.css",
})
export class BoardVotingSceneComponent implements AfterViewInit, OnDestroy {
    public readonly gameState = input<PartyGameState | null>(null);
    public readonly endVotingEarly = output<void>();

    @ViewChild("strip") stripEl!: ElementRef<HTMLDivElement>;

    private readonly stripWidth = signal(0);
    private resizeObserver: ResizeObserver | null = null;

    public readonly submissions = computed<RoundSubmission[]>(() => {
        const ms = this.gameState();
        if (!ms) return [];
        return ms.submissions[ms.currentRoundIndex] ?? [];
    });

    public readonly needsScroll = computed(() => {
        const count = this.submissions().length;
        if (count === 0) return false;
        const totalWidth = count * CARD_WIDTH + (count - 1) * CARD_GAP + STRIP_PAD * 2;
        const available = this.stripWidth();
        return available > 0 ? totalWidth > available : count > 4;
    });

    public readonly doubledSubmissions = computed(() => {
        const subs = this.submissions();
        if (subs.length === 0) return [];
        return [...subs, ...subs];
    });

    public readonly scrollDuration = computed(() => {
        const count = this.submissions().length;
        return `${Math.max(8, count * 4)}s`;
    });

    public readonly doneVotingCount = computed(() => {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "VOTING" ? ps.doneVotingIds.length : 0;
    });
    public readonly roundParticipantCount = computed(() => this.gameState()?.roundParticipantIds.length ?? 0);

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
}