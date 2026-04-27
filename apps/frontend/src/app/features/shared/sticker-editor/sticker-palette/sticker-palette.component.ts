import {
    Component, ElementRef, input, output, signal, computed,
    ViewChild, AfterViewInit, OnDestroy, NgZone, effect,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerDefinition} from '@birthday/shared';
import {StickerImgComponent} from '../sticker-img/sticker-img.component';
import {IconComponent} from '../../icon/icon.component';
import gsap from 'gsap';

export interface StickerDragStartEvent {
    stickerId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
}

@Component({
    selector: 'app-sticker-palette',
    standalone: true,
    imports: [CommonModule, StickerImgComponent, IconComponent],
    templateUrl: './sticker-palette.component.html',
    host: {'class': 'flex flex-col'},
})
export class StickerPaletteComponent implements AfterViewInit, OnDestroy {

    // ── Inputs / Outputs ──────────────────────────────────────────────────────

    readonly stickers       = input<StickerDefinition[]>([]);
    readonly canAddMore     = input<boolean>(true);
    readonly stickerDragStarted = output<StickerDragStartEvent>();

    @ViewChild('rowEl')   rowEl!:   ElementRef<HTMLDivElement>;
    @ViewChild('prevBtn') prevBtnEl!: ElementRef<HTMLButtonElement>;
    @ViewChild('nextBtn') nextBtnEl!: ElementRef<HTMLButtonElement>;

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
    private _pageDir: 'prev' | 'next' = 'next';

    constructor(private readonly zone: NgZone) {
        // Animate prev button whenever canPrev changes
        effect(() => {
            const can = this.canPrev();
            const el = this.prevBtnEl?.nativeElement;
            if (!el) return;
            gsap.to(el, {
                scale: can ? 1 : 0.65,
                opacity: can ? 1 : 0.3,
                duration: 0.22,
                ease: can ? 'back.out(2.5)' : 'power2.in',
                overwrite: 'auto',
            });
        });

        // Animate next button whenever canNext changes
        effect(() => {
            const can = this.canNext();
            const el = this.nextBtnEl?.nativeElement;
            if (!el) return;
            gsap.to(el, {
                scale: can ? 1 : 0.65,
                opacity: can ? 1 : 0.3,
                duration: 0.22,
                ease: can ? 'back.out(2.5)' : 'power2.in',
                overwrite: 'auto',
            });
        });
    }

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(() => this.recalcPageSize());
        if (this.rowEl?.nativeElement) this.resizeObserver.observe(this.rowEl.nativeElement);
        this.recalcPageSize();

        // Set initial button states without animation
        gsap.set(this.prevBtnEl.nativeElement, {
            scale: this.canPrev() ? 1 : 0.65,
            opacity: this.canPrev() ? 1 : 0.3,
        });
        gsap.set(this.nextBtnEl.nativeElement, {
            scale: this.canNext() ? 1 : 0.65,
            opacity: this.canNext() ? 1 : 0.3,
        });
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    // ── Paging ────────────────────────────────────────────────────────────────

    prevPage(): void {
        if (this.canPrev()) {
            this._pageDir = 'prev';
            this.animatePage(() => this.currentPage.update(p => p - 1));
        }
    }

    nextPage(): void {
        if (this.canNext()) {
            this._pageDir = 'next';
            this.animatePage(() => this.currentPage.update(p => p + 1));
        }
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
        const rowEl = this.rowEl?.nativeElement;
        if (!rowEl) { updateFn(); return; }

        const dir = this._pageDir;
        const outX = dir === 'next' ? -28 : 28;
        const inX  = dir === 'next' ?  28 : -28;

        // Bounce the clicked button
        const btnEl = dir === 'next' ? this.nextBtnEl?.nativeElement : this.prevBtnEl?.nativeElement;
        if (btnEl) {
            gsap.fromTo(btnEl,
                { scale: 0.8 },
                { scale: 1, duration: 0.28, ease: 'back.out(3)', overwrite: true },
            );
        }

        // Slide old stickers out, update, slide new stickers in
        gsap.to(rowEl, {
            x: outX,
            opacity: 0,
            duration: 0.13,
            ease: 'power2.in',
            onComplete: () => {
                gsap.set(rowEl, { x: inX, opacity: 0 });
                updateFn();
                requestAnimationFrame(() => {
                    gsap.to(rowEl, {
                        x: 0,
                        opacity: 1,
                        duration: 0.22,
                        ease: 'power2.out',
                    });
                });
            },
        });
    }
}

