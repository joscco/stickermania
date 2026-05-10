import {Component, input, output, ViewChild, computed, ElementRef, AfterViewInit, OnDestroy, inject, signal, DestroyRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement, StickerPack, StickerHand} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StickerEditorComponent} from '../../../../shared/sticker-editor/sticker-editor.component';

export interface SubmitCollageEvent {
    placements: StickerPlacement[];
    imageDataUrl: string | null;
}

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [CommonModule, StickerEditorComponent, AnimOnInitDirective, PromptBannerComponent],
    templateUrl: "./player-building.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingComponent implements AfterViewInit, OnDestroy {
    public readonly roundIndex = input<number>(0);
    public readonly prompt = input<string>('');
    public readonly myHand = input<StickerHand | null>(null);
    public readonly stickerCatalog = input<StickerDefinition[]>([]);
    public readonly stickerPacks = input<StickerPack[]>([]);
    public readonly maxStickersOnCanvas = input<number>(12);

    public readonly skipRound = output<void>();
    public readonly submitCollage = output<SubmitCollageEvent>();

    @ViewChild("editor") editor!: StickerEditorComponent;
    @ViewChild("banner") bannerRef!: ElementRef<HTMLElement>;
    @ViewChild("footer") footerRef!: ElementRef<HTMLElement>;
    @ViewChild("editorWrap") editorWrapRef!: ElementRef<HTMLElement>;

    public readonly availableHeight = signal(400);
    public readonly availableWidth = signal(400);

    public readonly handStickers = computed<StickerDefinition[]>(() => {
        const hand = this.myHand();
        if (!hand) return [];
        const ids = new Set(hand.stickerIds);
        return this.stickerCatalog().filter(s => ids.has(s.id));
    });

    private readonly el = inject(ElementRef);
    private readonly destroyRef = inject(DestroyRef);
    private resizeObserver?: ResizeObserver;

    public get placements(): StickerPlacement[] {
        return this.editor?.placements() ?? [];
    }

    public async onSubmit(): Promise<void> {
        const placements = this.editor?.placements() ?? [];
        if (placements.length === 0) return;

        let imageDataUrl: string | null = null;
        try { imageDataUrl = await this.editor.toDataUrl(); } catch {}

        this.submitCollage.emit({ placements, imageDataUrl });
    }

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(() => {
            const host = this.el.nativeElement as HTMLElement;
            const hostH = host.clientHeight;
            const hostW = host.clientWidth;
            const bannerH = this.bannerRef?.nativeElement?.offsetHeight ?? 70;
            const footerH = this.footerRef?.nativeElement?.offsetHeight ?? 56;
            const gap = 8;
            this.availableHeight.set(Math.max(hostH - bannerH - footerH - gap, 100));
            this.availableWidth.set(Math.max(hostW, 100));
        });
        this.resizeObserver.observe(this.el.nativeElement);
        this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }
}