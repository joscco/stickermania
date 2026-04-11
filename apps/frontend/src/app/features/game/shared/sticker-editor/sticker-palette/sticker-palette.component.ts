import {
    Component, ElementRef, input, output, signal, computed,
    ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import gsap from 'gsap';
import type {StickerDefinition} from '@birthday/shared';
import {PaletteDragController} from './palette-drag-controller';

export interface StickerDroppedEvent {
    stickerId: string;
    clientX: number;
    clientY: number;
    renderedWidth: number;
    renderedHeight: number;
}

@Component({
    selector: 'app-sticker-palette',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './sticker-palette.component.html',
    host: {'class': 'flex flex-col'},
})
export class StickerPaletteComponent implements AfterViewInit, OnDestroy {

    // ── Inputs / Outputs ──────────────────────────────────────────────────────

    readonly stickers       = input<StickerDefinition[]>([]);
    readonly canAddMore     = input<boolean>(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly dropTarget     = input<any>(null);
    readonly stickerDropped = output<StickerDroppedEvent>();

    @ViewChild('rowEl') rowEl!: ElementRef<HTMLDivElement>;

    readonly activeDragId = signal<string | null>(null);

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

    private dragController!: PaletteDragController;
    private resizeObserver: ResizeObserver | null = null;

    constructor(private readonly zone: NgZone) {}

    ngAfterViewInit(): void {
        this.dragController = new PaletteDragController(
            () => this.resolveDropTarget(),
            ev  => this.stickerDropped.emit(ev),
            id  => this.activeDragId.set(id),
        );
        this.resizeObserver = new ResizeObserver(() => this.recalcPageSize());
        if (this.rowEl?.nativeElement) this.resizeObserver.observe(this.rowEl.nativeElement);
        this.recalcPageSize();
    }

    ngOnDestroy(): void {
        this.dragController?.destroy();
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

    onPointerDown(event: PointerEvent, sticker: StickerDefinition, thumbEl: HTMLElement): void {
        if (!this.canAddMore()) return;
        this.dragController.start(event, sticker.id, sticker.imageUrl, thumbEl);
    }

    // ── Template helpers ──────────────────────────────────────────────────────

    getStickerUrl(stickerId: string): string {
        return this.stickers().find(s => s.id === stickerId)?.imageUrl ?? '';
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private resolveDropTarget(): HTMLElement | null {
        const t = this.dropTarget();
        if (!t) return null;
        return (t as ElementRef<HTMLElement>).nativeElement ?? (t as HTMLElement) ?? null;
    }

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
        const el = this.rowEl?.nativeElement;
        if (!el) { updateFn(); return; }
        const items   = Array.from(el.querySelectorAll<HTMLElement>('[data-thumb]'));
        const targets = items.length ? items : [el];
        gsap.to(targets, {
            y: -10, opacity: 0, duration: 0.16, ease: 'power2.in',
            onComplete: () => {
                this.zone.run(() => {
                    updateFn();
                    setTimeout(() => {
                        const next = Array.from(el.querySelectorAll<HTMLElement>('[data-thumb]'));
                        gsap.fromTo(
                            next.length ? next : [el],
                            {y: 12, opacity: 0},
                            {y: 0, opacity: 1, duration: 0.22, ease: 'power2.out', stagger: 0.025},
                        );
                    }, 0);
                });
            },
        });
    }
}

