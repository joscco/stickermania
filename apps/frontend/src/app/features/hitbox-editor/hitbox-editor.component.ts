import {Component, signal, computed, ElementRef, ViewChild, OnDestroy, OnInit, AfterViewInit, HostListener} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {RouterModule} from "@angular/router";
import {PolygonEditService} from './helper/polygon-edit.service';
import {HitboxPersistenceService} from './helper/hitbox-persistence.service';
import {EditorInteractionHandler} from './helper/editor-interaction.handler';
import {autoDetectHitbox} from './helper/auto-hitbox.util';

/**
 * Visual hitbox polygon editor for stickers.
 *
 * Thin orchestrator — delegates polygon state to {@link PolygonEditService},
 * persistence to {@link HitboxPersistenceService}, and mouse/keyboard
 * interaction to {@link EditorInteractionHandler}.
 *
 * Route: /hitbox-editor
 */
@Component({
    selector: "app-hitbox-editor",
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: "./hitbox-editor.component.html",
    providers: [PolygonEditService, HitboxPersistenceService, EditorInteractionHandler],
})
export class HitboxEditorComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild("editorArea") editorArea!: ElementRef<HTMLDivElement>;

    /** Padding (in px) around the fitted image so edge points are reachable */
    public readonly edgePadding = 40;

    /** Auto-detect UI state */
    public readonly autoDetecting = signal(false);
    public readonly tolerance = signal(0.02);
    public readonly alphaThreshold = signal(20);

    /** Natural image dimensions — updated when a sticker image loads */
    private readonly imgNatWidth = signal(1);
    private readonly imgNatHeight = signal(1);

    /** Available container dimensions — updated via ResizeObserver */
    private readonly containerWidth = signal(600);
    private readonly containerHeight = signal(400);

    /** Fitted image width (fills available space minus padding, preserves aspect ratio) */
    public readonly fittedWidth = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const pad = this.edgePadding * 2;
        const cw = this.containerWidth() - pad;
        const ch = this.containerHeight() - pad;
        if (cw <= 0 || ch <= 0) {
          return 100;
        }
        return cw / ch > aspect ? Math.floor(ch * aspect) : cw;
    });

    /** Fitted image height */
    public readonly fittedHeight = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const pad = this.edgePadding * 2;
        const cw = this.containerWidth() - pad;
        const ch = this.containerHeight() - pad;
        if (cw <= 0 || ch <= 0) return 100;
        return cw / ch > aspect ? ch : Math.floor(cw / aspect);
    });

    /** Interactive wrapper width (image + padding on each side) */
    public readonly wrapperWidth = computed(() => this.fittedWidth() + this.edgePadding * 2);

    /** Interactive wrapper height (image + padding on each side) */
    public readonly wrapperHeight = computed(() => this.fittedHeight() + this.edgePadding * 2);

    /** SVG points string in pixel coordinates (offset by edgePadding) */
    public readonly svgPixelPoints = computed(() => {
        const w = this.fittedWidth();
        const h = this.fittedHeight();
        const pad = this.edgePadding;
        return this.poly.polygon().map(p => `${p.x * w + pad},${p.y * h + pad}`).join(" ");
    });

    private resizeObserver: ResizeObserver | null = null;

    constructor(
        public readonly poly: PolygonEditService,
        public readonly persistence: HitboxPersistenceService,
        public readonly interaction: EditorInteractionHandler,
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────

    async ngOnInit(): Promise<void> {
        await this.persistence.loadCatalog();
    }

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.containerWidth.set(Math.floor(entry.contentRect.width));
                this.containerHeight.set(Math.floor(entry.contentRect.height));
            }
        });
        if (this.editorArea?.nativeElement) {
            this.resizeObserver.observe(this.editorArea.nativeElement);
        }
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
        this.persistence.destroy();
    }

    // ── Template callbacks ───────────────────────────────────

    public onImageLoaded(event: Event): void {
        const img = event.target as HTMLImageElement;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            this.imgNatWidth.set(img.naturalWidth);
            this.imgNatHeight.set(img.naturalHeight);
        }
    }

    public async runAutoDetect(): Promise<void> {
        const sticker = this.persistence.selectedSticker();
        if (!sticker) {
          return;
        }
        this.autoDetecting.set(true);
        try {
            const result = await autoDetectHitbox(sticker.imageUrl, this.tolerance(), this.alphaThreshold());
            if (result.length >= 3) {
                this.poly.load(result);
            }
        } finally {
            this.autoDetecting.set(false);
        }
    }

    @HostListener("window:keydown", ["$event"])
    onKeyDown(event: KeyboardEvent): void {
        if (this.interaction.onKeyDown(event)) {
            event.preventDefault();
        }
    }
}
