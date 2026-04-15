import {
    Component, ElementRef, input, output, signal, computed,
    ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerDefinition} from '@birthday/shared';
import {StickerImgComponent} from '../sticker-img/sticker-img.component';

export interface StickerDragStartEvent {
    stickerId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
}

@Component({
    selector: 'app-sticker-palette',
    standalone: true,
    imports: [CommonModule, StickerImgComponent],
    templateUrl: './sticker-palette.component.html',
    host: {'class': 'flex flex-col'},
})
export class StickerPaletteComponent implements AfterViewInit, OnDestroy {

    // ── Inputs / Outputs ──────────────────────────────────────────────────────

    readonly stickers       = input<StickerDefinition[]>([]);
    readonly canAddMore     = input<boolean>(true);
    readonly stickerDragStarted = output<StickerDragStartEvent>();

    @ViewChild('rowEl') rowEl!: ElementRef<HTMLDivElement>;

    // ── Paging ────────────────────────────────────────────────────────────────

    readonly pageSize    = signal(6);
    readonly currentPage = signal(0);

    readonly pageCount = computed(() =>
        Math.max(1, Math.ceil(this.stickers().length / this.pageSize())),
    );
    readonly pageStickers = computed(() => {
        const start = this.currentPage() * this.pageSize();
        return this.stickers().slice(start, start + this.pageSize());
    });
    readonly canPrev = computed(() => this.currentPage() > 0);
    readonly canNext = computed(() => this.currentPage() < this.pageCount() - 1);

    // ── Internals ─────────────────────────────────────────────────────────────

    private resizeObserver: ResizeObserver | null = null;

    constructor(private readonly zone: NgZone) {}

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(() => this.recalcPageSize());
        if (this.rowEl?.nativeElement) this.resizeObserver.observe(this.rowEl.nativeElement);
        this.recalcPageSize();
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    // ── Paging ────────────────────────────────────────────────────────────────

    prevPage(): void {
        if (this.canPrev()) this.animatePage(() => this.currentPage.update(p => p - 1));
    }

    nextPage(): void {
        if (this.canNext()) this.animatePage(() => this.currentPage.update(p => p + 1));
    }

    range(n: number): number[] {
        return Array.from({length: Math.max(0, n)}, (_, i) => i);
    }

    // ── Drag ─────────────────────────────────────────────────────────────────

    onPointerDown(event: PointerEvent, sticker: StickerDefinition): void {
        if (!this.canAddMore()) return;
        if (event.button !== 0 && event.button !== undefined) return;
        event.preventDefault();

        this.stickerDragStarted.emit({
            stickerId: sticker.id,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
        });
    }

    // ── Template helpers ──────────────────────────────────────────────────────

    getStickerUrl(stickerId: string): string {
        return this.stickers().find(s => s.id === stickerId)?.imageUrl ?? '';
    }

    // ── Private ───────────────────────────────────────────────────────────────


    private recalcPageSize(): void {
        const el = this.rowEl?.nativeElement;
        if (!el) return;
        const count = Math.max(3, Math.floor(el.clientWidth / 72));
        this.zone.run(() => {
            this.pageSize.set(count);
            const maxPage = Math.max(0, Math.ceil(this.stickers().length / count) - 1);
            if (this.currentPage() > maxPage) this.currentPage.set(maxPage);
        });
    }

    private animatePage(updateFn: () => void): void {
        // [ANIMATIONS DISABLED] update immediately without GSAP transition
        updateFn();
    }
}

