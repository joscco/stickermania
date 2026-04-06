import {
    Component,
    ElementRef,
    input,
    output,
    signal,
    computed,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    NgZone,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import gsap from "gsap";
import type {StickerDefinition} from "@birthday/shared";
import {CANVAS_STICKER_PX} from '../sticker-editor/sticker-editor.component';

export interface StickerDroppedEvent {
    stickerId: string;
    clientX: number;
    clientY: number;
    renderedWidth: number;
    renderedHeight: number;
}

@Component({
    selector: "app-sticker-palette",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-palette.component.html",
    host: {"class": "flex flex-col"},
})
export class StickerPaletteComponent implements AfterViewInit, OnDestroy {
    // ── Inputs / Outputs ──────────────────────────────────────────
    readonly stickers    = input<StickerDefinition[]>([]);
    readonly canAddMore  = input<boolean>(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly dropTarget  = input<any>(null);
    readonly stickerDropped = output<StickerDroppedEvent>();

    @ViewChild("rowEl") rowEl!: ElementRef<HTMLDivElement>;

    public readonly activeDragId = signal<string | null>(null);

    // ── Paging ───────────────────────────────────────────────────
    public readonly pageSize    = signal(6);
    public readonly currentPage = signal(0);

    public readonly pageCount = computed(() =>
        Math.max(1, Math.ceil(this.stickers().length / this.pageSize()))
    );
    public readonly pageStickers = computed(() => {
        const start = this.currentPage() * this.pageSize();
        return this.stickers().slice(start, start + this.pageSize());
    });
    public readonly canPrev = computed(() => this.currentPage() > 0);
    public readonly canNext = computed(() => this.currentPage() < this.pageCount() - 1);

    // ── Drag state ───────────────────────────────────────────────
    private ghostEl: HTMLElement | null = null;
    private dragRenderedWidth  = CANVAS_STICKER_PX;
    private dragRenderedHeight = CANVAS_STICKER_PX;
    private dragStickerId: string | null = null;
    private activePointerId: number | null = null;

    private resizeObserver: ResizeObserver | null = null;
    private boundMove = this.onGlobalMove.bind(this);
    private boundUp   = this.onGlobalUp.bind(this);

    constructor(private zone: NgZone) {}

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(() => this.recalcPageSize());
        if (this.rowEl?.nativeElement) this.resizeObserver.observe(this.rowEl.nativeElement);
        this.recalcPageSize();
    }

    ngOnDestroy(): void {
        this.cleanup(this.canvasEl ?? undefined);
        this.resizeObserver?.disconnect();
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

    public prevPage(): void {
        if (!this.canPrev()) return;
        this.animatePage(() => this.currentPage.update(p => p - 1));
    }

    public nextPage(): void {
        if (!this.canNext()) return;
        this.animatePage(() => this.currentPage.update(p => p + 1));
    }

    private animatePage(updateFn: () => void): void {
        const el = this.rowEl?.nativeElement;
        if (!el) { updateFn(); return; }

        const items = Array.from(el.querySelectorAll<HTMLElement>("[data-thumb]"));
        const targets = items.length ? items : [el];

        gsap.to(targets, {
            y: -10, opacity: 0, duration: 0.16, ease: "power2.in",
            onComplete: () => {
                this.zone.run(() => {
                    updateFn();
                    setTimeout(() => {
                        const newItems = Array.from(el.querySelectorAll<HTMLElement>("[data-thumb]"));
                        gsap.fromTo(
                            newItems.length ? newItems : [el],
                            {y: 12, opacity: 0},
                            {y: 0, opacity: 1, duration: 0.22, ease: "power2.out", stagger: 0.025},
                        );
                    }, 0);
                });
            },
        });
    }

    /** Returns [0, 1, …, n-1] — for use in @for loops in the template. */
    public range(n: number): number[] {
        return Array.from({length: Math.max(0, n)}, (_, i) => i);
    }

    private get canvasEl(): HTMLElement | null {
        const t = this.dropTarget();
        if (!t) return null;
        return (t as ElementRef<HTMLElement>).nativeElement ?? (t as HTMLElement) ?? null;
    }

    public getStickerUrl(stickerId: string): string {
        return this.stickers().find(s => s.id === stickerId)?.imageUrl ?? "";
    }

    // ── Pointer drag ─────────────────────────────────────────────

    public onPointerDown(event: PointerEvent, sticker: StickerDefinition, thumbEl: HTMLElement): void {
        if (!this.canAddMore()) return;
        if (event.button !== 0 && event.button !== undefined) return;
        event.preventDefault();

        this.dragStickerId   = sticker.id;
        this.activePointerId = event.pointerId;
        this.activeDragId.set(sticker.id);

        const thumbImg = thumbEl.querySelector("img") as HTMLImageElement | null;
        if (thumbImg && thumbImg.naturalWidth > 0 && thumbImg.naturalHeight > 0) {
            this.dragRenderedHeight = CANVAS_STICKER_PX;
            this.dragRenderedWidth  = Math.round(CANVAS_STICKER_PX * thumbImg.naturalWidth / thumbImg.naturalHeight);
        } else {
            this.dragRenderedWidth  = CANVAS_STICKER_PX;
            this.dragRenderedHeight = CANVAS_STICKER_PX;
        }

        const {ghost} = this.createGhost(sticker.imageUrl, event.clientX, event.clientY);
        this.ghostEl = ghost;

        try { thumbEl.setPointerCapture(event.pointerId); } catch {}
        window.addEventListener("pointermove",   this.boundMove, {passive: false});
        window.addEventListener("pointerup",     this.boundUp);
        window.addEventListener("pointercancel", this.boundUp);
    }

    private onGlobalMove(event: PointerEvent): void {
        if (event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        if (!this.ghostEl) return;
        this.ghostEl.style.left = `${event.clientX}px`;
        this.ghostEl.style.top  = `${event.clientY}px`;
        const canvasEl = this.canvasEl;
        if (canvasEl) {
            const r = canvasEl.getBoundingClientRect();
            const over = event.clientX >= r.left && event.clientX <= r.right &&
                         event.clientY >= r.top  && event.clientY <= r.bottom;
            canvasEl.style.outline = over ? "3px solid #a855f7" : "";
        }
    }

    private onGlobalUp(event: PointerEvent): void {
        if (event.pointerId !== this.activePointerId) return;
        const canvasEl = this.canvasEl;

        this.ghostEl?.remove();
        this.ghostEl = null;

        if (canvasEl && this.dragStickerId) {
            const r = canvasEl.getBoundingClientRect();
            if (event.clientX >= r.left && event.clientX <= r.right &&
                event.clientY >= r.top  && event.clientY <= r.bottom) {
                this.stickerDropped.emit({
                    stickerId:      this.dragStickerId,
                    clientX:        event.clientX,
                    clientY:        event.clientY,
                    renderedWidth:  this.dragRenderedWidth,
                    renderedHeight: this.dragRenderedHeight,
                });
            }
        }
        this.cleanup(canvasEl ?? undefined);
    }

    private createGhost(imageUrl: string, x: number, y: number): {ghost: HTMLElement} {
        const ghost = document.createElement("div");
        ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);filter:drop-shadow(0 6px 16px rgba(0,0,0,0.35));transition:none;`;
        const img = document.createElement("img");
        img.src = imageUrl;
        img.style.cssText = `height:${CANVAS_STICKER_PX}px;width:auto;display:block;pointer-events:none;`;
        img.draggable = false;
        ghost.appendChild(img);
        document.body.appendChild(ghost);
        ghost.style.left = `${x}px`;
        ghost.style.top  = `${y}px`;
        return {ghost};
    }

    private cleanup(canvasEl?: HTMLElement): void {
        this.ghostEl?.remove();
        this.ghostEl             = null;
        this.dragRenderedWidth   = CANVAS_STICKER_PX;
        this.dragRenderedHeight  = CANVAS_STICKER_PX;
        this.dragStickerId       = null;
        this.activePointerId     = null;
        this.activeDragId.set(null);
        if (canvasEl) canvasEl.style.outline = "";
        window.removeEventListener("pointermove",   this.boundMove);
        window.removeEventListener("pointerup",     this.boundUp);
        window.removeEventListener("pointercancel", this.boundUp);
    }
}

